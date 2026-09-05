import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import XLSX from 'xlsx';
import WordExtractor from 'word-extractor';
import { Store, UserRecord } from './store.js';

export interface StudentRecord {
  name?: string;
  username?: string;
  studentId?: string;
  email?: string;
  rawLine: string;
}

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();
const fieldNames = ['name', 'username', 'studentId', 'email'] as const;

function columnIndices(headers: string[]): Record<typeof fieldNames[number], number> {
  const indices = { name: -1, username: -1, studentId: -1, email: -1 };
  headers.map(normalize).forEach((header, index) => {
    if (indices.name < 0 && /(^|\s)(student )?name(\s|$)/i.test(header)) indices.name = index;
    if (indices.username < 0 && /user(name)?/.test(header)) indices.username = index;
    if (indices.studentId < 0 && /(student\s*id|studentid|^id$)/.test(header)) indices.studentId = index;
    if (indices.email < 0 && header.includes('email')) indices.email = index;
  });
  return indices;
}

function recordsFromLines(text: string): StudentRecord[] {
  return text.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean).map((rawLine) => ({
    name: rawLine.match(/^[a-z][a-z\s.'-]*/i)?.[0]?.trim(),
    username: rawLine.match(/(?:@|username[:\s]+)([\w.-]+)/i)?.[1],
    email: rawLine.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0],
    studentId: rawLine.match(/\b[A-Z]{2,}[0-9]{2,}\b/i)?.[0],
    rawLine,
  }));
}

export async function extractStudentRecords(fileName: string, buffer: Buffer): Promise<StudentRecord[]> {
  const extension = fileName.toLowerCase().split('.').pop();
  if (!extension || !['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv'].includes(extension)) {
    throw new Error('Unsupported file. Use PDF, DOC, DOCX, XLS, XLSX, or CSV.');
  }

  if (extension === 'csv') return recordsFromLines(buffer.toString('utf8'));

  if (extension === 'xlsx' || extension === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
    if (!rows.length) return [];
    const indices = columnIndices((rows[0] as unknown[]).map(String));
    return rows.slice(1).map((row) => {
      const values = row as unknown[];
      const record: StudentRecord = { rawLine: JSON.stringify(values) };
      fieldNames.forEach((field) => {
        if (indices[field] >= 0 && values[indices[field]] != null) record[field] = String(values[indices[field]]).trim();
      });
      return record;
    }).filter((record) => fieldNames.some((field) => record[field]));
  }

  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return recordsFromLines(result.value);
  }

  if (extension === 'doc') {
    const extractor = new WordExtractor();
    const document = await extractor.extract(buffer);
    return recordsFromLines(document.getBody());
  }

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return recordsFromLines(result.text);
  } finally {
    await parser.destroy();
  }
}

function safeUser(user: UserRecord) {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatar: user.avatar,
    studentId: user.studentId,
    status: user.status,
  };
}

export async function matchStudentRecords(records: StudentRecord[]) {
  return Promise.all(records.slice(0, 500).map(async (record) => {
    const candidates = new Map<string, UserRecord>();
    for (const value of [record.studentId, record.username, record.email, record.name]) {
      if (!value) continue;
      const users = await Store.searchUsers(value, '000000000000000000000000');
      users.forEach((user) => candidates.set(user._id, user as UserRecord));
    }

    const exactByPriority = [
      record.studentId && [...candidates.values()].filter((user) => user.studentId && normalize(user.studentId) === normalize(record.studentId!)),
      record.username && [...candidates.values()].filter((user) => normalize(user.username) === normalize(record.username!)),
      record.email && [...candidates.values()].filter((user) => normalize(user.email) === normalize(record.email!)),
    ].find((matches) => matches && matches.length > 0);
    const matches = exactByPriority || [...candidates.values()].filter((user) =>
      record.name && normalize(user.displayName) === normalize(record.name)
    );

    return {
      record,
      status: matches.length === 1 ? 'Valid' : matches.length > 1 ? 'MultipleMatches' : 'NotRegistered',
      matches: matches.map(safeUser),
      selectedMatch: matches.length === 1 ? safeUser(matches[0]) : undefined,
    };
  }));
}