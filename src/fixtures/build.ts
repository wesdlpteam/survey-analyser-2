// Fabricated staff-survey fixture, shared by parser tests, quarantine tests,
// chart tests and the app's demo mode. All names/emails below are made up
// (no real Wesley staff) — the PII-looking strings exist on purpose so
// Task 3's quarantine logic has something real to catch.
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../parser/formsParser';
import type { SurveyModel } from '../types';

const HEADERS = [
  'ID',
  'Start time',
  'Completion time',
  'Email',
  'Name',
  'Which campus are you based at?',
  'Your role',
  'How satisfied are you with communication? (1-5)',
  'I feel supported by leadership.',
  'How likely are you to recommend working here? (0-10)',
  'Which resources do you use? ',
  'What is working well?',
  'What could be improved?',
];

const IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const START_TIMES = [
  '2026-03-02 09:15',
  '2026-03-02 10:02',
  '2026-03-02 13:47',
  '2026-03-03 08:30',
  '2026-03-03 11:12',
  '2026-03-03 15:05',
  '2026-03-04 09:00',
  '2026-03-04 12:40',
  '2026-03-04 16:20',
  '2026-03-05 08:55',
  '2026-03-05 10:30',
  '2026-03-05 14:18',
  '2026-03-06 09:40',
  '2026-03-06 11:25',
];

const COMPLETION_TIMES = [
  '2026-03-02 09:21',
  '2026-03-02 10:09',
  '2026-03-02 13:55',
  '2026-03-03 08:36',
  '2026-03-03 11:20',
  '2026-03-03 15:11',
  '2026-03-04 09:07',
  '2026-03-04 12:48',
  '2026-03-04 16:29',
  '2026-03-05 09:02',
  '2026-03-05 10:37',
  '2026-03-05 14:25',
  '2026-03-06 09:48',
  '2026-03-06 11:33',
];

// Fake "<firstname>.sample@example.com" addresses — fabricated, not real staff.
const EMAILS = [
  'alex.sample@example.com',
  'jamie.sample@example.com',
  'taylor.sample@example.com',
  'morgan.sample@example.com',
  'casey.sample@example.com',
  'jordan.sample@example.com',
  'riley.sample@example.com',
  'drew.sample@example.com',
  'sam.sample@example.com',
  'charlie.sample@example.com',
  'reese.sample@example.com',
  'quinn.sample@example.com',
  'skyler.sample@example.com',
  'rowan.sample@example.com',
];

// Fabricated names to match the fake emails above (no real Wesley staff).
const NAMES = [
  'Alex Sample',
  'Jamie Sample',
  'Taylor Sample',
  'Morgan Sample',
  'Casey Sample',
  'Jordan Sample',
  'Riley Sample',
  'Drew Sample',
  'Sam Sample',
  'Charlie Sample',
  'Reese Sample',
  'Quinn Sample',
  'Skyler Sample',
  'Rowan Sample',
];

const CAMPUSES = [
  'Glen Waverley',
  'St Kilda Rd',
  'Elsternwick',
  'Glen Waverley',
  'St Kilda Rd',
  'Elsternwick',
  'Glen Waverley',
  'St Kilda Rd',
  'Elsternwick',
  'Glen Waverley',
  'St Kilda Rd',
  'Elsternwick',
  'Glen Waverley',
  'St Kilda Rd',
];

const ROLES = [
  'Teacher',
  'Support staff',
  'Leadership',
  'Teacher',
  'Teacher',
  'Support staff',
  'Leadership',
  'Teacher',
  'Support staff',
  'Teacher',
  'Leadership',
  'Teacher',
  'Support staff',
  'Teacher',
];

// Integers 1-5; includes both 1 and 5 so the observed scale is exactly {1,5}.
const SATISFACTION = [4, 5, 3, 2, 4, 5, 1, 3, 4, 5, 2, 4, 3, 5];

// Ordered Likert labels; includes all 5 rungs so scale + labels are exact.
const LEADERSHIP_SUPPORT = [
  'Strongly agree',
  'Agree',
  'Neither agree nor disagree',
  'Disagree',
  'Strongly disagree',
  'Agree',
  'Strongly agree',
  'Agree',
  'Neither agree nor disagree',
  'Strongly agree',
  'Disagree',
  'Agree',
  'Neither agree nor disagree',
  'Strongly agree',
];

// Integers 0-10; includes both 0 and 10 so the observed scale is exactly {0,10}.
const RECOMMEND = [8, 10, 6, 4, 9, 0, 7, 8, 9, 10, 5, 7, 6, 8];

// Semicolon-joined multi-select answers.
const RESOURCES = [
  'Library;Printing',
  'Library',
  'IT Helpdesk;Wifi',
  'Printing;Parking',
  'Library;IT Helpdesk;Wifi',
  'Wifi',
  'Library;Meeting rooms',
  'Printing',
  'IT Helpdesk',
  'Library;Printing;Wifi',
  'Meeting rooms;Parking',
  'Library;Wifi',
  'Printing;IT Helpdesk',
  'Library;Parking',
];

// Free text, all 14 distinct. One mentions a colleague by name ("Mr Chen").
const WORKING_WELL = [
  'The new timetable software has made scheduling much easier this term.',
  'Communication from the leadership team has improved a lot lately.',
  'Mr Chen in the science department is always willing to help with new ideas.',
  'I appreciate the flexibility around remote work days.',
  'The staff room upgrade has made lunch breaks much nicer.',
  'Professional development sessions have been genuinely useful.',
  'The new intranet is easier to navigate than the old one.',
  'Our team meetings feel more focused and productive now.',
  'The onboarding process for new staff has really improved.',
  'I like how quickly IT tickets get resolved these days.',
  'The mentoring program has been a great support for me.',
  'Parking has been much less stressful since the new bays opened.',
  'The library resources are well stocked and easy to access.',
  'Staff wellbeing initiatives this year have been a nice touch.',
];

// Free text, all 14 distinct. One leaves contact details behind — fabricated,
// but shaped exactly like real PII so Task 3's quarantine can be tested on it.
const COULD_IMPROVE = [
  'More notice before roster changes would help a lot.',
  'The wifi in the St Kilda Rd building drops out often.',
  'Meeting rooms get booked out very quickly some weeks.',
  'Contact me on john.smith@example.com or 0412 345 678 if you want more detail.',
  'Printing queues can be slow during peak times.',
  'More parking spots would reduce morning stress.',
  'Clearer signage around the Elsternwick campus would help visitors.',
  'The feedback loop after surveys could be faster.',
  'Support staff could use more admin resources.',
  'The canteen menu could use a bit more variety.',
  'Noise in open-plan areas can be distracting sometimes.',
  'More storage space in classrooms would be useful.',
  'The booking system for excursions is a bit clunky.',
  'Earlier notice for staff meetings would be appreciated.',
];

function buildRows(): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (let i = 0; i < IDS.length; i++) {
    rows.push([
      IDS[i],
      START_TIMES[i],
      COMPLETION_TIMES[i],
      EMAILS[i],
      NAMES[i],
      CAMPUSES[i],
      ROLES[i],
      SATISFACTION[i],
      LEADERSHIP_SUPPORT[i],
      RECOMMEND[i],
      RESOURCES[i],
      WORKING_WELL[i],
      COULD_IMPROVE[i],
    ]);
  }
  return rows;
}

export function buildFixtureWorkbook(): ArrayBuffer {
  const aoa: (string | number)[][] = [HEADERS, ...buildRows()];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export function sampleModel(): SurveyModel {
  return parseWorkbook(buildFixtureWorkbook(), 'Staff_Survey_2026.xlsx');
}
