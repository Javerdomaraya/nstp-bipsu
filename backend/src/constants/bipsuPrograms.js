/**
 * Official BiPSU Academic Schools & Degree Programs
 * Strict Automatic Track Classification Rules for NSTP
 */

export const BIPSU_PROGRAMS = [
  {
    school: 'School of Graduate Studies',
    shortName: 'SGS',
    programs: [
      'Doctor in Management',
      'Doctor of Education',
      'Master of Arts in Education',
      'Master in Public Management',
    ],
  },
  {
    school: 'School of Arts and Sciences (SAS)',
    shortName: 'SAS',
    programs: [
      'Bachelor of Arts in Communication',
      'Bachelor of Arts in Economics',
    ],
  },
  {
    school: 'School of Business Management / Management and Entrepreneurship (SBM)',
    shortName: 'SBM',
    programs: [
      'BS in Business Administration',
      'Bachelor of Tourism Management',
      'Bachelor of Hospitality Management',
    ],
  },
  {
    school: 'School of Criminal Justice Education (SCJE)',
    shortName: 'SCJE',
    programs: [
      'BS in Criminology',
    ],
  },
  {
    school: 'School of Engineering (SOE)',
    shortName: 'SOE',
    programs: [
      'BS in Civil Engineering',
      'BS in Mechanical Engineering',
      'BS in Electrical Engineering',
      'BS in Computer Engineering',
    ],
  },
  {
    school: 'School of Nursing and Health Sciences (SNHS)',
    shortName: 'SNHS',
    programs: [
      'Bachelor of Science in Nursing',
    ],
  },
  {
    school: 'School of Teacher Education (STE - Naval & Biliran Campuses)',
    shortName: 'STE',
    programs: [
      'Bachelor of Early Childhood Education (BECEd)',
      'Bachelor of Elementary Education (BEEd)',
      'Bachelor of Secondary Education (BSEd)',
      'Bachelor of Special Needs Education (BSNEd)',
      'Bachelor of Physical Education (BPEd)',
      'Bachelor of Technology and Livelihood Education (BTLEd)',
    ],
  },
  {
    school: 'School of Technology and Computer Studies (STCS)',
    shortName: 'STCS',
    programs: [
      'BS in Computer Science',
      'BS in Information Systems',
      'BS in Industrial Technology',
    ],
  },
];

export const BIPSU_SCHOOLS = BIPSU_PROGRAMS.map((item) => item.school);

export function isCriminologyProgram(degreeProgram, school) {
  const normProg = String(degreeProgram || '').toLowerCase();
  const normSchool = String(school || '').toLowerCase();
  return (
    normProg.includes('criminology') ||
    normSchool.includes('criminal justice') ||
    normSchool.includes('scje')
  );
}

export function isTeacherEducationProgram(degreeProgram, school) {
  const normSchool = String(school || '').toLowerCase();
  if (normSchool.includes('graduate studies') || normSchool.includes('sgs')) {
    return false;
  }
  const normProg = String(degreeProgram || '').toLowerCase();
  if (normProg.includes('doctor of education') || normProg.includes('master of arts in education')) {
    return false;
  }
  return (
    normSchool.includes('teacher education') ||
    normSchool.includes('ste') ||
    normProg.includes('early childhood') ||
    normProg.includes('elementary education') ||
    normProg.includes('secondary education') ||
    normProg.includes('special needs') ||
    normProg.includes('physical education') ||
    normProg.includes('technology and livelihood') ||
    normProg.includes('education') ||
    normProg.includes('beced') ||
    normProg.includes('beed') ||
    normProg.includes('bsed') ||
    normProg.includes('bsned') ||
    normProg.includes('bped') ||
    normProg.includes('btled')
  );
}

export function getAutomaticTrackRouting(degreeProgram, school) {
  if (isCriminologyProgram(degreeProgram, school)) return 'MTS';
  if (isTeacherEducationProgram(degreeProgram, school)) return 'LTS';
  return null;
}

export function validateTrackPlacement(degreeProgram, school, requestedComponent) {
  const required = getAutomaticTrackRouting(degreeProgram, school);
  if (!required) return { valid: true };

  const normComp = String(requestedComponent || '').toUpperCase();
  if (required === 'MTS') {
    const isMts =
      normComp.includes('MTS') ||
      normComp.includes('ROTC') ||
      normComp.includes('ARMY') ||
      normComp.includes('NAVY');
    if (!isMts) {
      return {
        valid: false,
        error:
          'Students in BS in Criminology (School of Criminal Justice Education) are locked to MTS (ROTC) - Army or Navy.',
      };
    }
  } else if (required === 'LTS') {
    const isLts = normComp === 'LTS' || normComp.includes('LITERACY');
    if (!isLts) {
      return {
        valid: false,
        error:
          'Students in the School of Teacher Education are locked to LTS (Literacy Training Service).',
      };
    }
  }
  return { valid: true };
}
