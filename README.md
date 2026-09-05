# 🎥 FocusMeet AI — Intelligent, Secure Video Conferencing System

FocusMeet AI is a full-stack video conferencing application built with **React 19, Node.js, Express, Socket.IO, WebRTC, MediaPipe Face Mesh, and Web Speech AI**.

---

## 📁 Project Location

This standalone project folder is located on your Desktop:
```
C:\Users\srija chilakubathula\Desktop\FocusMeet-AI
```

---

## 🚀 How to Run (Without Any Assistance)

### Option 1: 1-Click Launch (Easiest)
Simply **double-click** the file:
```
start-all.bat
```
This automatically starts the backend server, starts the frontend dev server, and opens [http://localhost:5173/](http://localhost:5173/) in your default browser!

### Host Invitations and Friend-Laptop Testing

Hosts can create one invitation and upload a participant file from the meeting dialog. Supported formats are PDF, DOC/DOCX, XLS/XLSX, and CSV. The app extracts names, IDs, usernames, or email addresses, shows a preview, and invites only registered matching users. Students receive the invitation inside the authenticated app and must accept it before joining; there are no public meeting links.

Any authenticated account can schedule a meeting. The account that creates a meeting becomes that meeting's host and controls its invitations, materials, moderation, and analytics. Role-based student/host capabilities remain available for other host-only platform operations.

For a second laptop on the same network:

1. Copy `backend/.env.example` to `backend/.env` and set one shared `JWT_SECRET` and a MongoDB URI reachable by the backend laptop.
2. Run `npm run install:all` and `npm run build` on the backend laptop.
3. Run `npm run start:all` on the backend laptop and allow Node through the private-network firewall.
4. Find the backend laptop's LAN IP with `ipconfig`, then open `http://<LAN-IP>:5173/` on the friend's laptop.
5. Each person registers their own account. The host uploads the student's registered email/name, previews the match, and creates the meeting.

Keep the same MongoDB database and `JWT_SECRET` for all clients. Do not use `localhost` from the friend's laptop; `localhost` would refer to that laptop itself.

### Option 2: Manual Terminal Commands
If you prefer running commands manually:

**1. Start Backend:**
```bash
cd backend
node dist/index.js
```
*(Runs on `http://localhost:5000`)*

**2. Start Frontend:**
```bash
cd frontend
npm run dev
```
*(Runs on `http://localhost:5173`)*

**3. Run Verification Tests:**
```bash
cd backend
node test-e2e.js
```
*(Runs all 12 end-to-end test suites)*

---

## 🌟 Key Features & How to Demonstrate

### 1. Zero Public Links (High-Security Direct App-to-App Invitations)
- **Problem**: Zoom/Teams links can be leaked, forwarded, or bot-bombed by uninvited strangers.
- **Solution**: No public meeting links exist. Hosts search users from the system and add them to the invite list.
- **Demo**: Register separate host and student accounts. The host creates a meeting and uploads the student's registered name or email. The student accepts the in-app notification and joins without an external link.

### 1.5 Student List Import from Documents (Bulk Invitations)
- **Problem**: Manually searching for and adding 50 students one-by-one is tedious and error-prone.
- **Solution**: Hosts can upload a file (Excel, CSV, PDF, Word, TXT) containing student names, IDs, or emails. The system automatically matches against registered users and shows a preview for manual confirmation.
- **File Formats Supported**: PDF, Excel (.xlsx/.xls), Word (.docx/.doc), CSV, TXT, EML
- **Matching Logic**: 
  - Prioritizes Student ID → Email → Username → Display Name
  - Shows multiple matches when ambiguous (host selects which user)
  - Clearly marks unregistered students (they won't be invited)
- **Demo**:
  1. Create a CSV file with columns: Name, Email, StudentID
  2. In meeting creation modal, click "Choose file" and select your CSV
  3. System extracts rows and matches against registered users
  4. Preview shows: ✓ Ready to Invite (exact matches) | ⚠ Multiple Matches (disambiguate) | ✗ Not Registered
  5. Host resolves any ambiguous entries and clicks "Add X students"
  6. Meeting is created with selected students invited automatically
- **Documentation**: [STUDENT_IMPORT_GUIDE.md](STUDENT_IMPORT_GUIDE.md) for end-users | [STUDENT_IMPORT_TECHNICAL.md](STUDENT_IMPORT_TECHNICAL.md) for developers

### 2. Privacy-Preserving AI Visual Attention & Focus Detection (Core USP)
- **Problem**: Many attendees feel camera-shy or have bandwidth limits, but turning off the camera removes engagement visibility.
- **Solution**: 
  - MediaPipe Face Mesh analyzes facial landmarks (Eye Aspect Ratio, Head Pose Yaw/Pitch, Gaze Centering) directly in the local browser.
  - **Privacy Camera Mode**: Local camera stream is analyzed locally for attention metrics, but raw video is NOT transmitted to peers unless the user clicks "Broadcast Video". Peers see an avatar placeholder with an attention badge.
- **Demo**:
  - Look away or look down at a phone: watch the attention score decrease in real time.
  - Click the camera button to toggle Privacy Camera Mode: your video hides from peers while your attention score continues updating!

### 3. Automated >50% Distraction Alert
- **Feature**: If over 50% of participants show low attention (<60%), the server automatically pushes an alert banner to the host:
  > *"⚠️ More than 50% of participants appear distracted. Consider changing the presentation style or environment."*
- Includes quick suggestions (ask an interactive question, switch slides).

### 4. Dual-Channel AI Abuse & Toxicity Moderation
- **Chat Interceptor**: Try typing an abusive or offensive phrase in chat — the message is blocked before reaching others, the sender receives an instant warning, and an incident log is created.
- **Voice Moderation**: Uses speech-to-text to detect offensive spoken words and warns the participant immediately.
- **Host Moderation Console**: Host can click `[Warn]`, `[Mute Mic]`, or `[Kick]` from the Participants Drawer.

### 5. Post-Meeting Analytics Report
- When the meeting ends, an executive summary is generated showing average focus %, an attention timeline graph, distraction alerts count, and a full moderation audit log.

---

## 🎓 Viva / Project Defense Questions

**Q: Why build this if Zoom and Google Meet already exist?**
> *"We did not build a generic conferencing clone. FocusMeet AI specifically addresses three major limitations of traditional platforms: security vulnerability from public meeting links, inability to track attendee visual focus while respecting camera privacy, and lack of real-time proactive abuse moderation."*

**Q: How does the AI track focus if a participant turns off their camera?**
> *"In our architecture, the camera remains active locally for client-side landmark analysis, but the raw video is not broadcast to other participants. Only lightweight numerical attention scores (0-100) are sent to the server. This provides privacy-preserving engagement estimation."*

**Q: Is audio/video sent to an external server for AI processing?**
> *"No. All facial landmark computation and speech transcription are performed locally on the client device using WebGL and browser APIs, minimizing server bandwidth and keeping personal video private."*
