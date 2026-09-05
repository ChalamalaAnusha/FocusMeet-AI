# Student List Import Feature - User Guide

## Overview

The **Student List Import** feature allows meeting hosts to quickly import a list of students to invite from external documents. This is useful for importing entire classes or groups from spreadsheets, PDFs, or text files.

## Supported File Formats

| Format | Extensions | Notes |
|--------|-----------|-------|
| **Excel** | .xlsx, .xls | Auto-detects columns (Name, Username, StudentID, Email) |
| **CSV** | .csv | Tab, comma, or semicolon-separated with headers |
| **Word** | .docx, .doc | Extracts paragraphs and tables |
| **PDF** | .pdf | Text extraction only (no OCR for scanned images) |
| **Text** | .txt, .eml | One entry per line; regex-based parsing |

**Constraints:**
- Maximum file size: 10 MB
- Maximum entries per file: 500 (rest are ignored)

## How to Use

### Step 1: Open Meeting Creation Modal

1. Navigate to the Dashboard
2. Click **"Schedule Invitation-Only Meeting"**
3. Fill in the meeting title and details

### Step 2: Choose Import Method

You have two ways to add students:

#### Option A: Manual Search (Direct Invite)
- Type a student's name, username, or email in the search box
- Select from results and click **"Add"**
- Useful for adding 1-5 specific students

#### Option B: Upload Student List
- Click the **"Choose file"** button
- Select a document with student information
- Wait for extraction to complete (shows spinner)

### Step 3: Review Import Results

After uploading, you'll see students grouped into three sections:

#### ✓ Ready to Invite (Green)
- Students with **exact matches** found in the database
- These checkboxes are **pre-checked**
- Action: Review the names and proceed to confirmation
- Example: Email matches exactly, or studentID matches exactly

#### ⚠ Multiple Matches - Select One (Amber)
- Entries where **2 or more registered students** match the criteria
- Example: Three users all named "John" in the database
- Action: **You must choose** which user to invite using the radio buttons
- Tip: Look for additional info (username, student ID) to disambiguate
- The **confirm button is disabled** until all multiple-match entries are resolved

#### ✗ Not Registered (Red)
- Student names/IDs that **don't match any registered users**
- These checkboxes are **disabled** and not selected
- Action: These students will NOT be invited to the meeting
- To invite them: Ask them to register as users first, then add them manually

### Step 4: Confirm Selection

1. Resolve any **multiple match** selections (see above)
2. Review the count: *"Add X students"* button shows how many will be invited
3. Click **"Add X students"** to add them to the meeting participant list
4. (Optional) Use the manual search to add more students individually

### Step 5: Create Meeting

1. Confirm all meeting details are correct
2. Toggle **AI Visual Attention & Focus Tracking** and **Live Voice & Chat Abuse Moderation** as needed
3. Click **"Create Meeting & Send Invites"**
4. Invitations are sent to all selected students

## File Format Examples

### Excel Spreadsheet

| Student Name | Username | Student ID | Email |
|---|---|---|---|
| Anusha Kumar | anusha99 | ST101 | anusha@college.edu |
| Rahul Singh | rahul_s | ST102 | rahul@college.edu |
| Priya Sharma | priya_sh | ST103 | priya@college.edu |

**Notes:**
- Column order doesn't matter
- Column headers are auto-detected
- Even if you only have names, it will try to match them (but may find multiple matches)
- StudentID column is recommended for accuracy

### CSV with Headers

```csv
Name,Email,StudentID
Anusha,anusha@college.edu,ST101
Rahul,rahul@college.edu,ST102
Priya,priya@college.edu,ST103
```

**Delimiters supported:** comma (,), semicolon (;), tab (→)

### Text File (One Per Line)

```
Anusha ST101
Rahul Singh rahul@college.edu
Priya Sharma
ST104 john.doe@example.com
```

Pattern matching:
- Extracts names, emails (valid@domain.com), and student IDs (like ST101)
- Flexible format; order doesn't matter

### PDF or Word Document

Simply include student information in paragraphs or tables:

```
Class Attendance List

Anusha Kumar (ST101)
Rahul Singh (ST102)
Priya Sharma (ST103)
```

The system will extract and parse the text automatically.

## Matching Priority

When looking up a student, the system tries to match in this order:

1. **Exact Student ID** (if provided in file)
   - Fastest and most reliable
   - Example: If file says "ST101" and a user has studentId="ST101", instant match

2. **Exact Email** (if provided in file)
   - Example: If file says "john@college.edu" and a user's email is "john@college.edu", instant match

3. **Exact Username** (if provided in file)
   - Example: If file says "john_doe" and a user's username is "john_doe", instant match

4. **Loose Name Matching** (last resort)
   - Only used if above don't match
   - May result in multiple matches
   - Requires manual selection by the host

**Why this matters:**
- Upload files with Student ID for best results
- If only names are available, the host may need to resolve ambiguous matches

## Common Scenarios

### Scenario 1: Upload Excel with Names Only
**File:** StudentList.xlsx containing just student names

**What happens:**
1. File is processed, names are extracted
2. System searches for matching usernames/displayNames
3. If a name matches multiple users → ⚠ Multiple Matches section
4. You must choose which "John" is correct before creating meeting

**Tip:** Ask students to register with their full name, or add a Student ID column to the file.

### Scenario 2: Upload CSV with Email Addresses
**File:** class_emails.csv with "Name,Email" columns

**What happens:**
1. Emails are extracted and matched exactly
2. Most or all entries end up as ✓ Ready to Invite (if emails match registered accounts)
3. No ambiguity; can immediately confirm

**Tip:** Email-based matching is very reliable.

### Scenario 3: Mixed Content (PDF from School Records)
**File:** class_roster.pdf containing "ID: ST101, Name: Anusha"

**What happens:**
1. Text is extracted from PDF
2. Student IDs (ST101) are detected and matched first
3. Students are found via exact ID match → ✓ Ready to Invite
4. Minimal ambiguity; quick import

**Tip:** This is the ideal use case for the feature.

### Scenario 4: Unregistered Students in Upload
**File:** StudentList.xlsx with "Anusha, Rahul, Priya, NewStudent"

**What happens:**
1. Anusha → ✓ Ready to Invite (registered)
2. Rahul → ✓ Ready to Invite (registered)
3. Priya → ✓ Ready to Invite (registered)
4. NewStudent → ✗ Not Registered (not in database yet)

**Action:**
- NewStudent will NOT be invited
- After confirming, you could:
  - Ask NewStudent to register first, then add them manually, or
  - Proceed with just Anusha, Rahul, Priya

## What Happens After Import

### Meeting Created
- Meeting is created with the host as owner
- Selected students receive **in-app notifications** about the pending invitation
- Students must **accept the invitation** to join the meeting

### Invited Students' View
- Students see "Incoming Meeting Invitation" in their dashboard
- They see meeting title, date, and optional agenda
- They can **Accept** or **Decline** the invitation
- Only after accepting can they join the meeting

### Host's View
- Host sees meeting in "My Meetings" list
- Host can see pending invitations in meeting details
- Host can track acceptance status
- Host cannot see which students were imported vs. manually added (both treated the same)

## Security & Privacy

✅ **What is protected:**
- Only authenticated hosts can upload files
- Uploaded files are processed in-memory only (not saved to disk)
- Extracted data is cleared after import
- Students cannot see another student's invitation
- Unregistered students are never invited (no auto-account creation)

❌ **What is NOT protected:**
- If you upload a file with plaintext passwords or sensitive data, it will be extracted
- Avoid uploading files with sensitive information beyond name/ID/email

**Best Practice:** Prepare your student list file to contain only name, email, and/or student ID.

## Troubleshooting

### "File is too large. Maximum size is 10 MB."
- Your file exceeds the size limit
- Solution: Split the file into smaller chunks or remove unnecessary data

### "No names or email addresses were found in this file."
- The file was processed but no recognizable student data was extracted
- Causes: Empty file, wrong format, corrupted data
- Solution: Check file format, ensure it contains student names or emails

### "Multiple matches found — select one"
- More than one user in the database matches this entry
- Causes: Duplicate names, incomplete information in file
- Solution: Add Student ID or Email to the file, or manually disambiguate by selecting from the radio buttons

### "Not Registered"
- The student name/ID is not in the FocusMeet database
- Causes: Student hasn't created an account yet, or name is spelled differently
- Solution: Student should register first, then use manual search to add them

### Confirm button is greyed out
- There are unresolved **Multiple Matches** entries
- Solution: Make a selection for each ⚠ entry by clicking the radio buttons

### I uploaded the file but don't see results
- Check browser console for errors (F12 → Console tab)
- File may still be processing if it's large
- Solution: Wait a few seconds, or reload the page and try again

## Tips & Best Practices

1. **Use Student ID if available** — Fastest, most reliable matching
2. **Include Email addresses** — Avoids ambiguous name matches
3. **Keep file simple** — Only include necessary columns (Name, Email, StudentID)
4. **Test with a small group first** — Upload 5-10 students to verify matching works
5. **Have students register early** — Import works best when students already have accounts
6. **Review before confirming** — Always check the preview carefully; it's your last chance to fix ambiguous matches

## Limitations

- **No auto-account creation** — Unregistered students cannot be invited; they must register first
- **No bulk studentID assignment** — Students must set their own studentID during registration (or admin sets it)
- **Text-based PDF only** — Scanned/image-based PDFs won't extract correctly (no OCR)
- **No import history** — After meeting is created, you can't see which students came from file vs. manual search

## What's Next?

Once the meeting is created:

1. **Send reminders** — Optional: Use in-app chat or external message to remind students about the meeting
2. **Monitor acceptance** — Check meeting details to see who has accepted/declined
3. **Start meeting** — Only you (as host) can start the meeting once it begins
4. **Analyze results** — After the meeting, view meeting summary and analytics

---

**Questions?** Contact support or see the main [README.md](README.md) for setup instructions.
