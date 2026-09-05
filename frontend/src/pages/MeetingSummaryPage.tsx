import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../services/api.js';
import {
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Users,
  CheckCircle,
  FileText,
  Download,
  Star,
  Send,
  MessageSquare,
  Loader2,
  Sparkles,
  Check,
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface SummaryProps {
  meetingId: string;
  onBack: () => void;
}

export const MeetingSummaryPage: React.FC<SummaryProps> = ({ meetingId, onBack }) => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Feedback state (Requirement 10)
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [futureTopics, setFutureTopics] = useState<string>('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [studentFeedback, setStudentFeedback] = useState<any | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState('');
  const [feedbackError, setFeedbackError] = useState('');

  // PDF download state (Requirement 6)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [analyticsData, feedbackData] = await Promise.all([
          api.getMeetingAnalytics(meetingId).catch((e) => {
            console.error('Error fetching analytics:', e);
            return null;
          }),
          api.getMeetingFeedback(meetingId).catch((e) => {
            console.error('Error fetching feedback:', e);
            return null;
          }),
        ]);

        if (analyticsData) setAnalytics(analyticsData);

        const submittedFeedback = Array.isArray(feedbackData) ? feedbackData[0] : null;
        if (submittedFeedback) {
          setStudentFeedback(submittedFeedback);
          setRating(submittedFeedback.rating || 5);
          setFutureTopics(submittedFeedback.futureTopics || '');
          setFeedbackSubmitted(true);
        }
      } catch (err) {
        console.error('Error loading session summary:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [meetingId]);

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingFeedback(true);
    setFeedbackError('');
    setFeedbackSuccess('');

    try {
      const saved = await api.submitMeetingFeedback(meetingId, {
        rating,
        futureTopics,
      });
      setStudentFeedback(saved);
      setFeedbackSubmitted(true);
      setFeedbackSuccess('Thank you! Your feedback has been recorded and attached to your Session Summary PDF.');

      // Refresh analytics to update host view / metrics
      const updated = await api.getMeetingAnalytics(meetingId).catch(() => null);
      if (updated) setAnalytics(updated);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to submit feedback');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    setPdfError('');
    try {
      const filename = `FocusMeet-Session-Summary-${user?.username || 'Attendee'}.pdf`;
      await api.downloadStudentSummaryPdf(meetingId, filename);
    } catch (err: any) {
      setPdfError(err.message || 'Failed to download session summary PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-slate-500 text-sm gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="font-medium">Compiling session analytics & summary report...</p>
      </div>
    );
  }

  const meeting = analytics?.meeting;
  const alertsCount = analytics?.distractionAlertsCount ?? 0;
  const violations = analytics?.moderationViolations || [];
  const feedbacks = analytics?.feedbacks || [];
  const averageRating = analytics?.averageRating || 0;
  const isHost = meeting?.host === user?.id || meeting?.isHost;
  const focusDistribution = analytics?.focusDistribution;
  const personalFocus = analytics?.personalFocus;
  const focusStatus = (score: number | null | undefined) => score === null || score === undefined ? 'Analyzing attention...' : score >= 80 ? 'Highly Focused' : score >= 60 ? 'Moderate' : 'Low Focus';

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8 animate-fadeIn">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold shadow-xs transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
          <FileText className="w-3.5 h-3.5" />
          Post-Meeting Intelligence Report
        </div>
      </div>

      {/* Meeting Title & Summary Download Banner */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/90 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold mb-2">
              <CheckCircle className="w-3 h-3" />
              Session Completed
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {meeting?.title || 'Meeting Engagement Analytics'}
            </h1>
            <p className="text-xs text-slate-500 mt-1.5">
              Concluded on {new Date(meeting?.scheduledAt || Date.now()).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })} • Secure Authenticated Session
            </p>
          </div>

          {/* Download Session Summary PDF Button (Requirement 6) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto">
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold shadow-sm transition active:scale-[0.98]"
              title="Download your isolated personal session report"
            >
              {isDownloadingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isDownloadingPdf ? 'Generating PDF...' : 'Download My Session Summary (PDF)'}
            </button>
          </div>
        </div>

        {pdfError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{pdfError}</span>
          </div>
        )}
      </div>

      {/* Session Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Total Attendees</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">
              {meeting?.invitedUsers?.length || 1} Participants
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Distraction Alerts</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">
              {alertsCount} Triggered
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Moderation Violations</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">
              {violations.length} Incidents
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
            <Star className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">
              {isHost ? 'Student Rating' : 'Your Rating'}
            </div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">
              {isHost
                ? averageRating > 0
                  ? `${averageRating} / 5.0`
                  : 'Pending'
                : studentFeedback?.rating
                ? `${studentFeedback.rating} / 5 Stars`
                : 'Pending'}
            </div>
          </div>
        </div>
      </div>

      {isHost ? (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Focus / Attention Analytics</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Meeting Focus Report</h2>
            </div>
            <div className="text-right text-xs text-slate-500">Duration <span className="font-semibold text-slate-800">{analytics?.durationMinutes ?? '—'} min</span></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1 rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><div className="text-xs font-semibold text-indigo-700">Average Focus</div><div className="mt-2 text-4xl font-bold text-slate-900">{analytics?.averageFocusScore ?? '—'}<span className="text-xl">{analytics?.averageFocusScore !== null && analytics?.averageFocusScore !== undefined ? '%' : ''}</span></div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs text-slate-500">Participants</div><div className="mt-2 text-2xl font-bold text-slate-900">{analytics?.participantCount ?? 0}</div></div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5"><div className="text-xs text-emerald-700">Highly Focused</div><div className="mt-2 text-2xl font-bold text-slate-900">{focusDistribution?.focused ?? 0} <span className="text-sm font-medium text-slate-500">({focusDistribution?.focusedPercentage ?? 0}%)</span></div></div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5"><div className="text-xs text-rose-700">Low Focus</div><div className="mt-2 text-2xl font-bold text-slate-900">{focusDistribution?.low ?? 0} <span className="text-sm font-medium text-slate-500">({focusDistribution?.lowPercentage ?? 0}%)</span></div></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold text-slate-900">Participant Focus Distribution</h3>
              <div className="mt-5 space-y-4">
                {[['Focused', focusDistribution?.focusedPercentage ?? 0, 'bg-emerald-500'], ['Moderate', focusDistribution?.moderatePercentage ?? 0, 'bg-amber-400'], ['Low Focus', focusDistribution?.lowPercentage ?? 0, 'bg-rose-400']].map(([label, percentage, color]) => <div key={String(label)}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">{label}</span><span className="font-semibold text-slate-900">{percentage}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} /></div></div>)}
                <div className="flex justify-between text-xs text-slate-500"><span>Attention unavailable / Video Off</span><span className="font-semibold text-slate-700">{analytics?.unavailableCount ?? 0}</span></div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 min-h-[220px]">
              <h3 className="text-sm font-bold text-slate-900">Focus Trend</h3>
              {analytics?.timeline?.length ? <ResponsiveContainer width="100%" height={170}><LineChart data={analytics.timeline}><XAxis dataKey="time" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" dataKey="avgFocus" stroke="#4f46e5" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer> : <div className="flex h-40 items-center justify-center text-xs text-slate-500">Focus trend will appear as readings arrive.</div>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-slate-900">Participant Details</h3><div className="mt-4 max-h-72 overflow-y-auto"><div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-100 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><span>Participant</span><span>Average</span><span>Status</span></div>{(analytics?.participantDetails || []).map((participant: any) => <div key={participant.userId} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-2 py-3 text-xs"><span className="font-medium text-slate-800">{participant.displayName} <span className="text-slate-400">@{participant.username}</span></span><span className="font-bold text-slate-900">{participant.averageFocus}%</span><span className="text-slate-500">{focusStatus(participant.averageFocus)}</span></div>)}{!analytics?.participantDetails?.length && <p className="py-6 text-center text-xs text-slate-500">No participant focus readings were recorded.</p>}</div></div>
        </section>
      ) : (
        <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Your Meeting Focus</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-4xl font-bold text-slate-900">{analytics?.averageFocusScore ?? '—'}{analytics?.averageFocusScore !== null && analytics?.averageFocusScore !== undefined && '%'}</div><div className="mt-1 text-sm font-semibold text-indigo-700">Status: {focusStatus(analytics?.averageFocusScore)}</div></div><div className="text-left text-xs text-slate-600 sm:text-right"><div>Meeting duration: {analytics?.durationMinutes ?? '—'} min</div><div className="mt-1">Focused intervals: {personalFocus?.focusedIntervals ?? 0}</div><div>Low focus intervals: {personalFocus?.lowFocusIntervals ?? 0}</div></div></div>
          {analytics?.timeline?.length ? <div className="mt-5 h-36"><ResponsiveContainer width="100%" height="100%"><LineChart data={analytics.timeline}><XAxis dataKey="time" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" dataKey="avgFocus" stroke="#4f46e5" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div> : <p className="mt-4 text-xs text-slate-500">Your focus trend will appear when attention readings are available.</p>}
        </section>
      )}

      {/* Post-Meeting Student Feedback Card (Requirement 10) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Session Feedback & Ratings</h3>
              <p className="text-xs text-slate-500">
                Help improve future sessions. Your rating & requested topics are included in your official PDF summary.
              </p>
            </div>
          </div>
          {!isHost && feedbackSubmitted && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <Check className="w-3.5 h-3.5" />
              Feedback Submitted
            </span>
          )}
        </div>

        {!isHost && feedbackSuccess && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{feedbackSuccess}</span>
          </div>
        )}

        {!isHost && feedbackError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{feedbackError}</span>
          </div>
        )}

        {/* Feedback Input Form: only attendees can submit; hosts only review responses below. */}
        {!isHost && <form onSubmit={handleFeedbackSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              How would you rate this session? <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((starVal) => {
                const isFilled = (hoverRating !== null ? hoverRating : rating) >= starVal;
                return (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => setRating(starVal)}
                    onMouseEnter={() => setHoverRating(starVal)}
                    onMouseLeave={() => setHoverRating(null)}
                    className="p-1 rounded-lg hover:bg-slate-100 transition focus:outline-none"
                    title={`${starVal} Star${starVal > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`w-7 h-7 transition-colors ${
                        isFilled
                          ? 'fill-amber-400 text-amber-400'
                          : 'fill-none text-slate-300 hover:text-amber-300'
                      }`}
                    />
                  </button>
                );
              })}
              <span className="text-xs font-semibold text-slate-600 ml-2">
                {rating === 1 && '1 - Needs Improvement'}
                {rating === 2 && '2 - Fair'}
                {rating === 3 && '3 - Good'}
                {rating === 4 && '4 - Very Good'}
                {rating === 5 && '5 - Excellent'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              What topics should be covered in future sessions?
            </label>
            <textarea
              value={futureTopics}
              onChange={(e) => setFutureTopics(e.target.value)}
              placeholder="e.g. Deep dive into React Server Components, WebRTC peer-to-peer data channels, AI attention heuristics..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-slate-500">
              {feedbackSubmitted ? 'Update your submitted review at any time.' : 'Your review helps shape future curriculum.'}
            </p>
            <button
              type="submit"
              disabled={isSubmittingFeedback}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold shadow-sm transition"
            >
              {isSubmittingFeedback ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {feedbackSubmitted ? 'Update Feedback' : 'Submit Feedback'}
            </button>
          </div>
        </form>}

        {/* Host View: Aggregated Student Feedback Responses */}
        {isHost && (
          <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Student Reviews ({feedbacks.length} submitted • Avg: {averageRating}/5)
              </h4>
            </div>

            {feedbacks.length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {feedbacks.map((f: any, idx: number) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">@{f.username || 'Student'}</span>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${
                            i < f.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  {f.futureTopics ? (
                    <p className="text-slate-600 text-[11px] italic bg-white p-2 rounded-lg border border-slate-200/80">
                      "{f.futureTopics}"
                    </p>
                  ) : (
                    <p className="text-slate-400 text-[11px] italic">No future topics suggested</p>
                  )}
                  <div className="text-[10px] text-slate-400">
                    Submitted: {new Date(f.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div> : <p className="text-xs text-slate-500">No participant feedback has been submitted yet.</p>}
          </div>
        )}
      </div>

      {/* Moderation Audit Log */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          Moderation & Behavioral Audit Trail
        </h3>

        {violations.length === 0 ? (
          <div className="p-8 rounded-xl bg-slate-50 border border-slate-200/80 text-center space-y-2">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="font-semibold text-slate-800 text-sm">Clean Session Verified</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No abusive messages or disruptive speech patterns were detected during this meeting.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">User</th>
                  <th className="p-3">Channel</th>
                  <th className="p-3">Violation</th>
                  <th className="p-3">Transcript / Snippet</th>
                  <th className="p-3">Action Taken</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {violations.map((v: any) => (
                  <tr key={v._id || Math.random()} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-semibold text-slate-900">@{v.username}</td>
                    <td className="p-3 uppercase font-medium text-slate-500">{v.source}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold uppercase">
                        {v.violationType}
                      </span>
                    </td>
                    <td className="p-3 italic text-slate-600">"{v.snippet}"</td>
                    <td className="p-3 text-amber-700 font-semibold">{v.actionTaken}</td>
                    <td className="p-3 text-slate-400">
                      {new Date(v.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

