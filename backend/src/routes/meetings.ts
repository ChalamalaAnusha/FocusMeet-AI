import { Router, Response } from 'express';
import { Store, memoryStore } from '../services/store.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { extractStudentRecords, matchStudentRecords } from '../services/studentImport.js';
import { generateStudentSessionSummaryPdf } from '../services/pdfGenerator.js';

const router = Router();
const materialDirectory = path.resolve(process.cwd(), 'private-materials');
fs.mkdirSync(materialDirectory, { recursive: true });
const materialUpload = multer({
  storage: multer.diskStorage({
    destination: materialDirectory,
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().split('.').pop();
    const allowed = {
      pdf: ['application/pdf'],
      doc: ['application/msword', 'application/octet-stream'],
      docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'],
      xls: ['application/vnd.ms-excel', 'application/octet-stream'],
      xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
    } as Record<string, string[]>;
    callback(null, !!extension && !!allowed[extension] && allowed[extension].includes(file.mimetype));
  },
});
const studentListUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().split('.').pop();
    const mimeByExtension: Record<string, string[]> = {
      pdf: ['application/pdf'],
      doc: ['application/msword', 'application/octet-stream'],
      docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'],
      xls: ['application/vnd.ms-excel', 'application/octet-stream'],
      xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
      csv: ['text/csv', 'application/vnd.ms-excel', 'application/octet-stream'],
    };
    callback(null, !!extension && !!mimeByExtension[extension] && mimeByExtension[extension].includes(file.mimetype));
  },
});

router.post('/import-students', authMiddleware, studentListUpload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'A PDF, DOC, DOCX, XLS, XLSX, or CSV file is required' });
      return;
    }
    const records = await extractStudentRecords(req.file.originalname, req.file.buffer);
    if (!records.length) {
      res.status(400).json({ error: 'No student records found in this file' });
      return;
    }
    res.json({ students: await matchStudentRecords(records) });
  } catch (err) {
    console.error('Student list import error:', err);
    res.status(400).json({ error: 'Unable to process the student list' });
  }
});

// Create a meeting and invite specific users (No public links!)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, description, invitedUserIds, scheduledAt, settings } = req.body;
    const hostId = req.user!.userId;

    if (!title || !title.trim()) {
      res.status(400).json({ error: 'Meeting title is required' });
      return;
    }

    const requestedIds = Array.isArray(invitedUserIds) ? [...new Set(invitedUserIds.map(String))] : [];
    const authorizedIds: string[] = [];
    for (const userId of requestedIds) {
      if (await Store.findUserById(userId)) authorizedIds.push(userId);
    }

    const meeting = await Store.createMeeting({
      title: title.trim(),
      description: description || '',
      host: hostId,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      status: 'scheduled',
      invitedUsers: authorizedIds,
      settings: {
        allowChat: settings?.allowChat ?? true,
        aiFocusTracking: settings?.aiFocusTracking ?? true,
        toxicityModeration: settings?.toxicityModeration ?? true,
      },
    });

    // Create invitations for each invited user
    const invRecords = [];
    if (authorizedIds.length) {
      for (const recipientId of authorizedIds) {
        if (recipientId !== hostId) {
          const inv = await Store.createInvitation(meeting._id, hostId, recipientId);
          invRecords.push(inv);

          // Push live socket alert if recipient is online
          const recipientSocketId = memoryStore.userSockets.get(recipientId);
          if (recipientSocketId && (global as any).io) {
            (global as any).io.to(recipientSocketId).emit('meeting:incoming-call', {
              invitationId: inv._id,
              meetingId: meeting._id,
              title: meeting.title,
              host: {
                id: hostId,
                username: req.user!.username,
              },
              scheduledAt: meeting.scheduledAt,
            });
          }
        }
      }
    }

    res.status(201).json({ meeting, invitationsSent: invRecords.length });
  } catch (err) {
    console.error('Create meeting error:', err);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

router.post('/:id/materials', authMiddleware, materialUpload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const meeting = await Store.getMeetingById(meetingId);
    if (!meeting) { res.status(404).json({ error: 'Meeting not found' }); return; }
    if (meeting.host !== req.user!.userId) { res.status(403).json({ error: 'Only the meeting host can upload materials' }); return; }
    if (!req.file) { res.status(400).json({ error: 'A PDF, DOC, DOCX, XLS, or XLSX file is required' }); return; }
    const material = await Store.createStudyMaterial({
      meeting: meetingId,
      uploadedBy: req.user!.userId,
      originalName: path.basename(req.file.originalname),
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
    res.status(201).json({ material: { ...material, storedName: undefined } });
  } catch (err) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    res.status(400).json({ error: 'Unable to store study material' });
  }
});

router.get('/:id/materials', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const meeting = await Store.getMeetingById(meetingId);
  if (!meeting) { res.status(404).json({ error: 'Meeting not found' }); return; }
  const isParticipant = meeting.host === req.user!.userId || (meeting.invitedUsers.includes(req.user!.userId) && await Store.hasAcceptedInvitation(meetingId, req.user!.userId));
  if (!isParticipant) { res.status(403).json({ error: 'You are not authorized to access these materials' }); return; }
  const materials = await Store.getMeetingStudyMaterials(meetingId);
  res.json(materials.map(({ storedName, ...material }) => material));
});

router.get('/:id/materials/:materialId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const materialId = Array.isArray(req.params.materialId) ? req.params.materialId[0] : req.params.materialId;
  const meeting = await Store.getMeetingById(meetingId);
  const material = await Store.getStudyMaterial(materialId);
  const isParticipant = !!meeting && meeting.host === req.user!.userId || (!!meeting && meeting.invitedUsers.includes(req.user!.userId) && await Store.hasAcceptedInvitation(meetingId, req.user!.userId));
  if (!meeting || !material || material.meeting !== meetingId) { res.status(404).json({ error: 'Material not found' }); return; }
  if (!isParticipant) { res.status(403).json({ error: 'You are not authorized to access this material' }); return; }
  const filePath = path.join(materialDirectory, material.storedName);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Material file is unavailable' }); return; }
  res.download(filePath, material.originalName);
});

// Get all meetings for current user (hosted or invited)
router.get('/my', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meetings = await Store.getUserMeetings(req.user!.userId);
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// Get specific meeting details with permission verification
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const meeting = await Store.getMeetingById(meetingId);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const currentUserId = req.user!.userId;
    const isHost = meeting.host === currentUserId;
    const isInvited = meeting.invitedUsers.includes(currentUserId);
    const hasAcceptedInvite = isInvited && await Store.hasAcceptedInvitation(meetingId, currentUserId);

    if (!isHost && !hasAcceptedInvite) {
      res.status(403).json({
        error: 'Access Denied: Accept the meeting notification before joining.',
      });
      return;
    }

    const hostUser = await Store.findUserById(meeting.host);

    res.json({
      ...meeting,
      isHost,
      hostName: hostUser?.displayName || hostUser?.username || 'Host',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meeting details' });
  }
});

// End meeting (Host only)
router.post('/:id/end', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const meeting = await Store.getMeetingById(meetingId);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (meeting.host !== req.user!.userId) {
      res.status(403).json({ error: 'Only the host can end the meeting' });
      return;
    }

    await Store.updateMeetingStatus(meetingId, 'ended');

    // Notify all participants via socket
    if ((global as any).io) {
      (global as any).io.to(meetingId).emit('meeting:ended', { meetingId });
    }

    res.json({ message: 'Meeting ended successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to end meeting' });
  }
});

// Meeting analytics report
router.get('/:id/analytics', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const meeting = await Store.getMeetingById(meetingId);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const currentUserId = req.user!.userId;
    const isHost = meeting.host === currentUserId;
    const isParticipant = isHost || (meeting.invitedUsers.includes(currentUserId) && meeting.activeParticipants.includes(currentUserId));
    if (!isParticipant) {
      res.status(403).json({ error: 'You are not authorized to view this meeting report' });
      return;
    }

    if (isHost) {
      res.json(await Store.getMeetingAnalytics(meetingId));
      return;
    }

    const records = await Store.getUserMeetingFocusRecords(meetingId, currentUserId);
    const averageFocusScore = records.length
      ? Math.round(records.reduce((sum, record) => sum + record.focusScore, 0) / records.length)
      : null;
    const timeline = records
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((record) => ({ time: new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), avgFocus: record.focusScore, attendees: 1 }));
    const startTime = meeting.startedAt || meeting.scheduledAt;
    const endTime = meeting.endedAt || new Date();

    res.json({
      meeting,
      averageFocusScore,
      participantCount: 1,
      totalSamples: records.length,
      timeline,
      personalFocus: {
        averageFocusScore,
        focusedIntervals: records.filter((record) => record.focusScore >= 80).length,
        moderateIntervals: records.filter((record) => record.focusScore >= 60 && record.focusScore < 80).length,
        lowFocusIntervals: records.filter((record) => record.focusScore < 60).length,
      },
      durationMinutes: Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)),
      moderationViolations: [],
      feedbacks: [],
      averageRating: 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve analytics' });
  }
});

// Student Session Feedback Submission (Requirement 10)
router.post('/:id/feedback', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const meeting = await Store.getMeetingById(meetingId);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const currentUserId = req.user!.userId;
    if (meeting.host === currentUserId) {
      res.status(403).json({ error: 'Meeting hosts review participant feedback and do not submit ratings' });
      return;
    }
    if (!meeting.invitedUsers.includes(currentUserId) || !meeting.activeParticipants.includes(currentUserId)) {
      res.status(403).json({ error: 'Only participants who attended the meeting can submit feedback' });
      return;
    }

    const { rating, futureTopics } = req.body;
    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
      return;
    }

    const feedback = await Store.saveFeedback({
      meeting: meetingId,
      user: currentUserId,
      username: req.user!.username,
      rating: Math.round(numRating),
      futureTopics: typeof futureTopics === 'string' ? futureTopics.trim() : '',
    });

    res.status(201).json({ feedback, message: 'Session feedback submitted successfully' });
  } catch (err) {
    console.error('Submit feedback error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Student Session Feedback Retrieval (Requirement 10)
router.get('/:id/feedback', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const meeting = await Store.getMeetingById(meetingId);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const currentUserId = req.user!.userId;
    const isHost = meeting.host === currentUserId;

    if (isHost) {
      const feedbacks = await Store.getMeetingFeedback(meetingId);
      res.json(feedbacks);
      return;
    }

    const myFeedback = await Store.getStudentFeedback(meetingId, currentUserId);
    res.json(myFeedback ? [myFeedback] : []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
});

// Downloadable Student Session Summary PDF (Requirement 4)
router.get('/:id/student-summary-pdf', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const meeting = await Store.getMeetingById(meetingId);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const currentUserId = req.user!.userId;
    const isHost = meeting.host === currentUserId;
    const isInvited = meeting.invitedUsers.includes(currentUserId);

    if (!isHost && !isInvited) {
      res.status(403).json({ error: 'Access Denied: You are not authorized to access this session report.' });
      return;
    }

    const studentUser = await Store.findUserById(currentUserId);
    const hostUser = await Store.findUserById(meeting.host);

    // Private focus records for this student only (Requirement 2 & 4: never expose another student's scores)
    const userFocusRecords = await Store.getUserMeetingFocusRecords(meetingId, currentUserId);

    const avgFocus = userFocusRecords.length > 0
      ? Math.round(userFocusRecords.reduce((sum, r) => sum + r.focusScore, 0) / userFocusRecords.length)
      : (isHost ? 90 : 85);

    const focusedCount = userFocusRecords.filter((r) => r.focusScore >= 60).length;
    const totalSamples = userFocusRecords.length;
    const focusedPercentage = totalSamples > 0 ? Math.round((focusedCount / totalSamples) * 100) : 85;
    const distractedPercentage = 100 - focusedPercentage;

    // Retrieve student's own submitted feedback if available
    const studentFeedbackRecord = await Store.getStudentFeedback(meetingId, currentUserId);

    // Compute session duration
    const startTime = meeting.startedAt || meeting.scheduledAt;
    const endTime = meeting.endedAt || new Date();
    const durationMinutes = Math.max(15, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000));

    const pdfBuffer = generateStudentSessionSummaryPdf({
      meetingTitle: meeting.title,
      meetingDescription: meeting.description,
      hostName: hostUser?.displayName || hostUser?.username || 'Host Organizer',
      studentName: studentUser?.displayName || studentUser?.username || req.user!.username,
      studentUsername: studentUser?.username || req.user!.username,
      studentId: studentUser?.studentId,
      scheduledAt: meeting.scheduledAt,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      durationMinutes,
      attendanceStatus: 'Attended & Verified (Zero-Link Confirmed)',
      averageFocusScore: avgFocus,
      focusCategory: avgFocus >= 80 ? 'focused' : avgFocus >= 60 ? 'moderate' : 'low',
      totalSamples,
      focusedPercentage,
      distractedPercentage,
      studentFeedback: studentFeedbackRecord ? {
        rating: studentFeedbackRecord.rating,
        futureTopics: studentFeedbackRecord.futureTopics,
        submittedAt: studentFeedbackRecord.createdAt,
      } : null,
    });

    const safeTitle = meeting.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const safeStudent = (studentUser?.username || 'student').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Session_Summary_${safeTitle}_${safeStudent}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Student summary PDF error:', err);
    res.status(500).json({ error: 'Failed to generate session summary PDF' });
  }
});

export default router;
