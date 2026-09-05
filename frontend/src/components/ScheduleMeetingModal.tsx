import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Users, ShieldAlert, Sparkles, UserPlus, Upload, Loader2, GripVertical } from 'lucide-react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { api } from '../services/api.js';
import { User } from '../types/index.js';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface StudentRecord {
  name?: string;
  username?: string;
  studentId?: string;
  email?: string;
  rawLine: string;
}

interface ImportedStudent {
  record: StudentRecord;
  status: 'Valid' | 'MultipleMatches' | 'NotRegistered' | 'Error';
  matches?: User[];
  selectedMatch?: User;
}

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMeetingCreated: (meeting: any) => void;
}

export const ScheduleMeetingModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  onMeetingCreated,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [aiFocusTracking, setAiFocusTracking] = useState(true);
  const [toxicityModeration, setToxicityModeration] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [importedStudents, setImportedStudents] = useState<ImportedStudent[]>([]);
  const [studyMaterials, setStudyMaterials] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Draggable modal state
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

  const detectColumnIndices = (headerRow: string[]): Record<string, number> => {
    const indices = { name: -1, username: -1, studentId: -1, email: -1 };
    const normalized = headerRow.map((h) => normalize(h));

    for (let i = 0; i < normalized.length; i += 1) {
      const h = normalized[i];
      if (indices.name < 0 && (h.includes('name') || h.includes('student'))) indices.name = i;
      if (indices.username < 0 && (h.includes('username') || h.includes('user'))) indices.username = i;
      if (indices.studentId < 0 && (h.includes('student id') || h.includes('studentid') || h.includes('id'))) indices.studentId = i;
      if (indices.email < 0 && h.includes('email')) indices.email = i;
    }
    return indices;
  };

  const extractStudentRecords = async (file: File): Promise<StudentRecord[]> => {
    const extension = file.name.toLowerCase().split('.').pop();
    if (!extension || !['pdf', 'xlsx', 'xls', 'docx', 'doc', 'txt', 'csv', 'eml'].includes(extension)) {
      throw new Error('Unsupported file. Use PDF, Excel, Word, TXT, CSV, or EML.');
    }
    if (file.size > 10 * 1024 * 1024) throw new Error('File is too large. Maximum size is 10 MB.');

    const records: StudentRecord[] = [];

    if (['txt', 'eml'].includes(extension)) {
      const lines = (await file.text()).split(/[\r\n]+/).map(normalize).filter(Boolean);
      return lines.map((rawLine) => ({
        name: rawLine.match(/^[a-z\s]+/)?.[0]?.trim() || rawLine,
        email: rawLine.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/)?.[0],
        studentId: rawLine.match(/[A-Z]{2,}[0-9]{2,}/)?.[0],
        rawLine,
      }));
    }

    if (extension === 'csv') {
      const text = await file.text();
      const lines = text.split(/[\r\n]+/).filter(Boolean);
      const firstLine = lines[0];
      const headerRow = firstLine.split(/[,;\t]+/).map(normalize);
      const colIndices = detectColumnIndices(headerRow);

      for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].split(/[,;\t]+/).map((c) => c.trim());
        records.push({
          name: colIndices.name >= 0 ? cols[colIndices.name] : undefined,
          username: colIndices.username >= 0 ? cols[colIndices.username] : undefined,
          studentId: colIndices.studentId >= 0 ? cols[colIndices.studentId] : undefined,
          email: colIndices.email >= 0 ? cols[colIndices.email] : undefined,
          rawLine: lines[i],
        });
      }
      return records;
    }

    const buffer = await file.arrayBuffer();
    if (['xlsx', 'xls'].includes(extension)) {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });

      if (rows.length === 0) return [];

      const headerRow = (rows[0] as unknown[]).map((h) => String(h || ''));
      const colIndices = detectColumnIndices(headerRow);

      for (let i = 1; i < rows.length; i += 1) {
        const cols = rows[i] as unknown[];
        const record: StudentRecord = {
          name: colIndices.name >= 0 ? String(cols[colIndices.name] || '').trim() : undefined,
          username: colIndices.username >= 0 ? String(cols[colIndices.username] || '').trim() : undefined,
          studentId: colIndices.studentId >= 0 ? String(cols[colIndices.studentId] || '').trim() : undefined,
          email: colIndices.email >= 0 ? String(cols[colIndices.email] || '').trim() : undefined,
          rawLine: JSON.stringify(cols),
        };
        if (Object.values(record).some((v) => v && v !== JSON.stringify(cols))) {
          records.push(record);
        }
      }
      return records;
    }

    if (extension === 'docx') {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      const lines = result.value.split(/[\r\n]+/).filter(Boolean);
      return lines.map((rawLine) => ({
        name: rawLine.match(/^[a-z\s]+/i)?.[0]?.trim() || rawLine,
        email: rawLine.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0],
        studentId: rawLine.match(/[A-Z]{2,}[0-9]{2,}/)?.[0],
        rawLine,
      }));
    }

    const pdf = await getDocument({ data: buffer }).promise;
    const allText: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      allText.push(content.items.map((item: any) => item.str).join(' '));
    }

    const lines = allText.join('\n').split(/[\r\n]+/).filter(Boolean);
    return lines.map((rawLine) => ({
      name: rawLine.match(/^[a-z\s]+/i)?.[0]?.trim() || rawLine,
      email: rawLine.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0],
      studentId: rawLine.match(/[A-Z]{2,}[0-9]{2,}/)?.[0],
      rawLine,
    }));
  };

  const findMatchingUsers = async (record: StudentRecord): Promise<User[]> => {
    const queries = [];
    if (record.studentId) queries.push(record.studentId);
    if (record.email) queries.push(record.email);
    if (record.username) queries.push(record.username);
    if (record.name) queries.push(record.name);

    const allMatches = new Map<string, User>();
    for (const query of queries) {
      if (!query) continue;
      try {
        const results = await api.searchUsers(query);
        results.forEach((user: User) => {
          const uid = user.id || (user as any)._id;
          allMatches.set(String(uid), user);
        });
      } catch (err) {
        // Silently continue if a query fails
      }
    }

    if (allMatches.size === 0) return [];

    // Filter to exact matches based on the record fields
    const exactMatches = Array.from(allMatches.values()).filter((user: User) => {
      if (record.studentId && (user as any).studentId && normalize((user as any).studentId) === normalize(record.studentId)) {
        return true;
      }
      if (record.email && normalize(user.email) === normalize(record.email)) return true;
      if (record.username && normalize(user.username) === normalize(record.username)) return true;
      return false;
    });

    return exactMatches.length > 0 ? exactMatches : Array.from(allMatches.values());
  };

  const findImportedUsers = async (records: StudentRecord[]) => {
    const results: ImportedStudent[] = [];
    const seenRecords = new Set<string>();

    for (const record of records) {
      const key = `${record.name}-${record.email}-${record.studentId}`;
      if (seenRecords.has(key)) continue;
      seenRecords.add(key);

      try {
        const matches = await findMatchingUsers(record);
        if (matches.length === 0) {
          results.push({ record, status: 'NotRegistered' });
        } else if (matches.length === 1) {
          results.push({ record, status: 'Valid', matches, selectedMatch: matches[0] });
        } else {
          results.push({ record, status: 'MultipleMatches', matches });
        }
      } catch (err) {
        results.push({ record, status: 'Error' });
      }
    }
    return results;
  };

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    setIsExtracting(true);
    setError(null);
    try {
      const response = await api.importStudentList(file);
      setImportedStudents(response.students);
    } catch (err: any) {
      setImportedStudents([]);
      setError(err.message || 'Unable to process this file.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSetSelection = (index: number, user: User) => {
    setImportedStudents((current) =>
      current.map((item, i) => (i === index ? { ...item, selectedMatch: user } : item))
    );
  };

  const confirmImport = () => {
    const validUsers = importedStudents
      .filter((item) => (item.status === 'Valid' || item.status === 'MultipleMatches') && item.selectedMatch)
      .map((item) => item.selectedMatch!);

    setSelectedUsers((current) => [
      ...current,
      ...validUsers.filter((candidate) => !current.some((user) => (user.id || (user as any)._id) === (candidate.id || (candidate as any)._id))),
    ]);
    setImportedStudents([]);
  };

  // Search users whenever query changes
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const users = await api.searchUsers(searchQuery);
        // Exclude already selected
        const unselected = users.filter((u: User) => !selectedUsers.some((sel) => sel.id === u.id || (sel as any)._id === (u as any)._id));
        setSearchResults(unselected);
      } catch (err) {
        console.warn('Search error:', err);
      }
    };

    if (isOpen) {
      fetchUsers();
    }
  }, [searchQuery, selectedUsers, isOpen]);

  const handleSelectUser = (user: User) => {
    setSelectedUsers((prev) => [...prev, user]);
    setSearchQuery(''); // Clear search after adding
  };

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId && (u as any)._id !== userId));
  };

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, button, textarea, [role="button"]')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a meeting title');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const invitedUserIds = selectedUsers.map((u) => u.id || (u as any)._id);
      const res = await api.createMeeting({
        title,
        description,
        invitedUserIds,
        settings: {
          allowChat: true,
          aiFocusTracking,
          toxicityModeration,
        },
      });

      for (const file of studyMaterials) {
        await api.uploadStudyMaterial(res.meeting._id, file);
      }

      onMeetingCreated(res.meeting);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create meeting');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div
        ref={modalRef}
        onMouseDown={handleMouseDown}
        className={`glass-panel w-full max-w-xl p-6 rounded-2xl border border-slate-200 bg-white shadow-2xl relative transition-all ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          userSelect: isDragging ? 'none' : 'auto',
        }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-slate-400 flex-shrink-0 cursor-grab hover:text-slate-600" />
            <div>
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                Schedule Invitation-Only Meeting
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Zero public links. Only authenticated users selected below can enter.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Meeting Title
            </label>
            <input
              type="text"
              placeholder="e.g. AI Product Architecture Review"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white text-sm transition"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Agenda & Details (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Discussion on focus estimation algorithms and security safeguards..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white text-sm resize-none transition"
            />
          </div>

          {/* User Search & Selection (Direct App-to-App Invite) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Add Participants (Direct Invite)
            </label>
            
            {/* Selected Chips */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5 p-2 rounded-xl bg-slate-50 border border-slate-200">
                {selectedUsers.map((u) => {
                  const uid = u.id || (u as any)._id;
                  return (
                    <span
                      key={uid}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium"
                    >
                      <img
                        src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`}
                        alt=""
                        className="w-4 h-4 rounded-full"
                      />
                      <span>{u.displayName || u.username}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(uid)}
                        className="text-indigo-400 hover:text-indigo-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search registered users by username or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white text-sm transition"
              />
            </div>

            {/* Search Dropdown / Suggestions */}
            <div className="mt-2 max-h-36 overflow-y-auto space-y-1 rounded-xl bg-white p-1.5 border border-slate-200 shadow-xs">
              {searchResults.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">
                  No other users found. Type to search.
                </div>
              ) : (
                searchResults.map((u) => {
                  const uid = u.id || (u as any)._id;
                  return (
                    <div
                      key={uid}
                      onClick={() => handleSelectUser(u)}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-indigo-50 cursor-pointer transition text-xs group"
                    >
                      <div className="flex items-center gap-2">
                        <img
                          src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`}
                          alt=""
                          className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200"
                        />
                        <div>
                          <div className="font-medium text-slate-800">{u.displayName || u.username}</div>
                          <div className="text-[10px] text-slate-400">@{u.username}</div>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-indigo-600 group-hover:text-indigo-700 font-medium">
                        <UserPlus className="w-3.5 h-3.5" />
                        Add
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-3 p-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900">
                <Upload className="w-4 h-4 text-indigo-600" />
                Upload participant names or emails
              </div>
              <p className="text-[10px] text-slate-500 mt-1">PDF, DOC, DOCX, XLS, XLSX, or CSV. Only registered users can be invited.</p>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs text-white font-medium shadow-xs transition">
                {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {isExtracting ? 'Extracting...' : 'Choose file'}
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.docx,.doc,.csv"
                  className="hidden"
                  onChange={(event) => handleImportFile(event.target.files?.[0])}
                />
              </label>
            </div>

            <div className="mt-3 p-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                <Upload className="w-4 h-4 text-emerald-600" />
                Attach study materials
              </div>
              <p className="text-[10px] text-slate-500 mt-1">PDF, DOC, DOCX, XLS, or XLSX. Materials are private to this meeting.</p>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs text-white font-medium shadow-xs transition">
                <Upload className="w-3.5 h-3.5" />
                Choose materials
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.docx,.doc"
                  multiple
                  className="hidden"
                  onChange={(event) => setStudyMaterials(Array.from(event.target.files || []))}
                />
              </label>
              {studyMaterials.length > 0 && <p className="text-[10px] text-emerald-700 font-semibold mt-2">{studyMaterials.length} material{studyMaterials.length === 1 ? '' : 's'} attached</p>}
            </div>

            {importedStudents.length > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-800">Student List Import ({importedStudents.length})</span>
                  <button
                    type="button"
                    onClick={() => setImportedStudents([])}
                    className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>

                {/* Valid matches */}
                {importedStudents.filter((item) => item.status === 'Valid').length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] font-semibold text-emerald-700 uppercase mb-1.5">✓ Ready to invite ({importedStudents.filter((item) => item.status === 'Valid').length})</div>
                    <div className="space-y-1">
                      {importedStudents
                        .filter((item) => item.status === 'Valid')
                        .map((item, index) => (
                          <div key={index} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px]">
                            <input type="checkbox" checked className="w-3 h-3 accent-emerald-600" readOnly />
                            <span className="flex-1 text-emerald-800 font-medium">
                              {item.selectedMatch?.displayName || item.selectedMatch?.username}
                              {item.record.studentId && <span className="text-emerald-600"> (ID: {item.record.studentId})</span>}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Multiple matches - require selection */}
                {importedStudents.filter((item) => item.status === 'MultipleMatches').length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] font-semibold text-amber-700 uppercase mb-1.5">⚠ Multiple matches - select one ({importedStudents.filter((item) => item.status === 'MultipleMatches').length})</div>
                    <div className="space-y-2">
                      {importedStudents
                        .filter((item) => item.status === 'MultipleMatches')
                        .map((item, index) => (
                          <div key={index} className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                            <div className="text-[10px] text-amber-900 mb-1 font-medium">
                              Looking for: <span className="font-bold">{item.record.name || item.record.email || item.record.studentId}</span>
                            </div>
                            <div className="space-y-1">
                              {item.matches?.map((match) => {
                                const uid = match.id || (match as any)._id;
                                const isSelected = item.selectedMatch?.id === match.id || (item.selectedMatch as any)?._id === uid;
                                return (
                                  <label
                                    key={uid}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition ${isSelected ? 'bg-amber-100 border border-amber-300' : 'bg-white border border-slate-200 hover:bg-amber-50/50'}`}
                                  >
                                    <input
                                      type="radio"
                                      name={`match-${index}`}
                                      checked={isSelected}
                                      onChange={() => handleSetSelection(importedStudents.findIndex((s) => s === item), match)}
                                      className="w-3 h-3 accent-amber-600"
                                    />
                                    <span className="text-[11px] text-slate-800">
                                      {match.displayName || match.username}
                                      <span className="text-slate-500"> @{match.username}</span>
                                      {(match as any).studentId && <span className="text-slate-500"> ID:{(match as any).studentId}</span>}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Not registered */}
                {importedStudents.filter((item) => item.status === 'NotRegistered').length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] font-semibold text-rose-700 uppercase mb-1.5">✗ Not registered ({importedStudents.filter((item) => item.status === 'NotRegistered').length})</div>
                    <div className="space-y-1">
                      {importedStudents
                        .filter((item) => item.status === 'NotRegistered')
                        .map((item, index) => (
                          <div key={index} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px]">
                            <input type="checkbox" disabled className="w-3 h-3 accent-rose-500" />
                            <span className="flex-1 text-rose-800">
                              {item.record.name || item.record.email || item.record.studentId}
                              <span className="text-rose-500 text-[10px]"> — Not registered in system</span>
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Confirm button - disabled if there are unresolved MultipleMatches */}
                <button
                  type="button"
                  onClick={confirmImport}
                  disabled={importedStudents.some((item) => item.status === 'MultipleMatches' && !item.selectedMatch)}
                  className="w-full mt-3 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  {importedStudents.some((item) => item.status === 'MultipleMatches' && !item.selectedMatch)
                    ? `Resolve ${importedStudents.filter((item) => item.status === 'MultipleMatches' && !item.selectedMatch).length} ambiguous matches`
                    : `Add ${importedStudents.filter((item) => item.selectedMatch || item.status === 'Valid').length} students`}
                </button>
              </div>
            )}
          </div>

          {/* AI Settings */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-semibold text-slate-800">AI Visual Attention & Focus Tracking</span>
              </div>
              <input
                type="checkbox"
                checked={aiFocusTracking}
                onChange={(e) => setAiFocusTracking(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white border-slate-300"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-semibold text-slate-800">Live Voice & Chat Abuse Moderation</span>
              </div>
              <input
                type="checkbox"
                checked={toxicityModeration}
                onChange={(e) => setToxicityModeration(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white border-slate-300"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-sm font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Dispatching Invites...' : 'Create Meeting & Send Invites'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
