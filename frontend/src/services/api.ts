const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const invalidateSessionOnUnauthorized = (status: number, endpoint: string, hadToken: boolean) => {
  if (status === 401 && hadToken && !endpoint.startsWith('/auth/')) {
    localStorage.removeItem('focusmeet_token');
    window.dispatchEvent(new CustomEvent('focusmeet:unauthorized'));
  }
};

const readResponseData = async (res: Response): Promise<any> => {
  const body = await res.text();
  if (!body.trim()) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return { error: body.trim() };
  }
};

export const api = {
  async request(endpoint: string, options: RequestInit = {}) {
    const token = localStorage.getItem('focusmeet_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
    } catch {
      throw new Error('Unable to reach the backend. Start the backend and check backend/.env configuration.');
    }

    const data = await readResponseData(res);
    invalidateSessionOnUnauthorized(res.status, endpoint, !!token);
    if (!res.ok) {
      throw new Error(
        data.error ||
          (res.status >= 500
            ? 'The backend returned an empty response. Check the backend server and backend/.env configuration.'
            : `Request failed (${res.status})`)
      );
    }
    return data;
  },

  // Auth
  login: (credentials: any) =>
    api.request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  register: (userData: any) =>
    api.request('/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
  getMe: () => api.request('/auth/me'),

  // Users
  searchUsers: (query: string) => api.request(`/users/search?q=${encodeURIComponent(query)}`),
  getContacts: () => api.request('/users/contacts'),

  // Meetings
  createMeeting: (meetingData: any) =>
    api.request('/meetings', { method: 'POST', body: JSON.stringify(meetingData) }),
  uploadStudyMaterial: async (meetingId: string, file: File) => {
    const token = localStorage.getItem('focusmeet_token');
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(`${API_BASE}/meetings/${meetingId}/materials`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    const data = await readResponseData(res);
    invalidateSessionOnUnauthorized(res.status, `/meetings/${meetingId}/materials`, !!token);
    if (!res.ok) throw new Error(data.error || `Study material upload failed (${res.status})`);
    return data;
  },
  getStudyMaterials: (meetingId: string) => api.request(`/meetings/${meetingId}/materials`),
  downloadStudyMaterial: async (meetingId: string, materialId: string, fileName: string) => {
    const token = localStorage.getItem('focusmeet_token');
    const res = await fetch(`${API_BASE}/meetings/${meetingId}/materials/${materialId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    invalidateSessionOnUnauthorized(res.status, `/meetings/${meetingId}/materials/${materialId}`, !!token);
    if (!res.ok) throw new Error('Unable to download study material');
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  },
  importStudentList: async (file: File) => {
    const token = localStorage.getItem('focusmeet_token');
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(`${API_BASE}/meetings/import-students`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    const data = await readResponseData(res);
    invalidateSessionOnUnauthorized(res.status, '/meetings/import-students', !!token);
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  getMyMeetings: () => api.request('/meetings/my'),
  getMeeting: (id: string) => api.request(`/meetings/${id}`),
  endMeeting: (id: string) => api.request(`/meetings/${id}/end`, { method: 'POST' }),
  getMeetingAnalytics: (id: string) => api.request(`/meetings/${id}/analytics`),

  // Invitations
  getPendingInvitations: () => api.request('/invitations/pending'),
  respondInvitation: (id: string, status: 'accepted' | 'declined') =>
    api.request(`/invitations/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  // Feedback & Session Summary PDF (Requirements 6 & 10)
  submitMeetingFeedback: (meetingId: string, feedback: { rating: number; futureTopics: string }) =>
    api.request(`/meetings/${meetingId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(feedback),
    }),
  getMeetingFeedback: (meetingId: string) => api.request(`/meetings/${meetingId}/feedback`),
  downloadStudentSummaryPdf: async (meetingId: string, fileName?: string) => {
    const token = localStorage.getItem('focusmeet_token');
    const res = await fetch(`${API_BASE}/meetings/${meetingId}/student-summary-pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    invalidateSessionOnUnauthorized(res.status, `/meetings/${meetingId}/student-summary-pdf`, !!token);
    if (!res.ok) {
      let message = 'Unable to download session summary PDF';
      try {
        const errorJson = await res.json();
        if (errorJson.error) message = errorJson.error;
      } catch (_) {}
      throw new Error(message);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'FocusMeet-Session-Summary.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Moderation
  getModerationEvents: (meetingId: string) => api.request(`/moderation/${meetingId}`),
  takeModerationAction: (actionData: any) =>
    api.request('/moderation/action', { method: 'POST', body: JSON.stringify(actionData) }),
};

