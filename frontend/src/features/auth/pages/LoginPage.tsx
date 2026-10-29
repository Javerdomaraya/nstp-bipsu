import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cloud,
  Download,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  IdCard,
  Landmark,
  ListChecks,
  Lock,
  LockKeyhole,
  Mail,
  MapPinned,
  Megaphone,
  Menu,
  MoonStar,
  PlayCircle,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  SunMedium,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
  BIPSU_PROGRAMS,
  INDUSTRIAL_TECHNOLOGY_MAJORS,
  INDUSTRIAL_TECHNOLOGY_PROGRAM,
  SECONDARY_EDUCATION_MAJORS,
  SECONDARY_EDUCATION_PROGRAM,
  YEAR_LEVEL_OPTIONS,
  isCriminologyProgram,
  isTeacherEducationProgram,
  isProgramWithMajor,
} from '../../../data/nstpData';
import splashImage from '../../../assets/images/splash.png';
import nstpLogo from '../../../assets/nstp-logo.svg';
import { apiPost } from '../../../services/apiClient';
import { normalizeAuthenticatedUser, type AuthenticatedUser } from '../../../services/authUser';
import { fetchProvinces, fetchMunicipalities, type Province, type Municipality } from '../../../services/api';
import BarangaySearch from '../components/BarangaySearch';
import { getBuiltInProvinces, getBuiltInMunicipalities } from '../../../data/addressData';

export const SEEDED_PASSWORD = 'Password123!';

export const COORDINATOR_ACCOUNTS = [
  {
    scope: 'CWTS',
    label: 'CWTS',
    identifier: 'coord.cwts@bipsu.edu.ph',
    password: SEEDED_PASSWORD,
    name: 'Prof. Maria Santos',
    title: 'CWTS Component Coordinator',
    badge: 'Track Overseer (CWTS)',
    features: ['Manages CWTS & CWTS Coast Guard components across Biliran municipalities'],
  },
  {
    scope: 'LTS',
    label: 'LTS',
    identifier: 'coord.lts@bipsu.edu.ph',
    password: SEEDED_PASSWORD,
    name: 'Prof. Elena Rivera',
    title: 'LTS Component Coordinator',
    badge: 'Track Overseer (LTS)',
    features: ['Manages LTS Literacy Training Service for Biliran school communities'],
  },
  {
    scope: 'MTS',
    label: 'MTS / ROTC',
    identifier: 'coord.mts@bipsu.edu.ph',
    password: SEEDED_PASSWORD,
    name: 'Maj. Roberto Garcia',
    title: 'MTS / ROTC Component Coordinator',
    badge: 'Track Overseer (MTS/ROTC)',
    features: ['Manages MTS Army and MTS Navy tactical defense preparation units'],
  },
] as const;

export const SEEDED_CREDENTIALS = {
  admin: {
    identifier: 'admin@bipsu.edu.ph',
    password: SEEDED_PASSWORD,
    title: 'NSTP Director & Dean',
    badge: 'Institutional Governor',
    name: 'Dr. Reynold G. Bustillo',
    features: ['Institutional KPIs & Biliran Municipality Overview'],
  },
  coordinator: {
    identifier: 'coord.cwts@bipsu.edu.ph',
    password: SEEDED_PASSWORD,
    title: 'CWTS Component Coordinator',
    badge: 'Track Overseer (CWTS)',
    name: 'Prof. Maria Santos',
    features: ['Component KPIs & Student Distribution donut with accessible legend'],
  },
  facilitator: {
    identifier: 'facilitator.naval@bipsu.edu.ph',
    password: SEEDED_PASSWORD,
    title: 'NSTP Senior Field Facilitator',
    badge: 'Field Instructor (Naval & Almeria)',
    name: 'Engr. Juan Dela Cruz',
    features: ['Cohort KPIs: Total Students, Sessions Held, Attendance Today %, Cohort Progress %'],
  },
  student: {
    identifier: 'student.naval1@bipsu.edu.ph',
    password: SEEDED_PASSWORD,
    title: 'BS in Computer Science (CWTS)',
    badge: 'Enrolled Learner',
    name: 'Javer Domaraya',
    features: ['Enrolled track status, Module hours progress, and 1-tap shortcuts'],
  },
} as const;

type LoginMode = 'login' | 'register';
type PublicView = 'home' | 'nstp' | 'school' | 'portal' | 'feature' | 'preview';

const componentCards = [
  { label: 'CWTS', title: 'Civic Welfare Training Service', copy: 'Community development, health, environment, disaster readiness, and service-learning projects.', color: 'from-emerald-500 to-teal-500', fill: '#10b981', value: 32 },
  { label: 'CWTS (Coast Guard)', title: 'Civic Welfare Training Service - Coast Guard', copy: 'Coastal defense, maritime safety, search and rescue, and community service along Philippine waters.', color: 'from-cyan-500 to-sky-600', fill: '#06b6d4', value: 14 },
  { label: 'LTS', title: 'Literacy Training Service', copy: 'Literacy, numeracy, tutoring, and learning support for partner schools and communities.', color: 'from-blue-600 to-cyan-500', fill: '#2563eb', value: 26 },
  { label: 'MTS Army', title: 'Military Training Service - Army', copy: 'Discipline, leadership, physical readiness, and national defense preparation.', color: 'from-amber-500 to-orange-600', fill: '#f59e0b', value: 18 },
  { label: 'MTS Navy', title: 'Military Training Service - Navy', copy: 'Maritime awareness, coastal service, naval discipline, and emergency coordination.', color: 'from-indigo-500 to-violet-600', fill: '#6366f1', value: 10 },
];

const landingComponents = [
  {
    key: 'CWTS',
    title: 'Civic Welfare Training Service',
    copy: 'Prepares students for organized community service through health, environment, disaster readiness, safety, livelihood, and local development initiatives. Includes Coast Guard track focusing on maritime safety, coastal defense, and search and rescue.',
    focus: ['Community immersion', 'Disaster preparedness', 'Health and environment projects', 'Maritime safety and search and rescue'],
  },
  {
    key: 'LTS',
    title: 'Literacy Training Service',
    copy: 'Trains students to support literacy and numeracy programs for learners, out-of-school youth, and community partners who need learning assistance.',
    focus: ['Reading support', 'Numeracy sessions', 'Learning materials and tutoring'],
  },
  {
    key: 'MTS',
    title: 'Military Training Service',
    copy: 'Develops discipline, leadership, physical readiness, and national defense awareness through Army or Navy-oriented training pathways.',
    focus: ['Leadership and discipline', 'Defense preparedness', 'Army or Navy track assignment'],
  },
];

const portalFeatures = [
  {
    icon: BookOpen,
    label: 'Common Module',
    value: 'Deliver standardized learning with tracked completion.',
    color: 'from-blue-500 to-blue-700',
    metric: '25 hours',
    status: '8 lessons prepared',
    audience: 'Students and NSTP facilitators',
    preview: 'A sequenced learning path with lesson sections, completion buttons, learning hours, post-tests, and downloadable references.',
    bullets: ['NSTP law, citizenship, disaster readiness, leadership, health, environment, and final reflection', 'Lesson-level completion records for every student', 'Admin view for publishing and updating module content'],
    data: [
      { name: 'Lessons', score: 100 },
      { name: 'Post-tests', score: 88 },
      { name: 'Hours', score: 100 },
    ],
  },
  {
    icon: Users,
    label: 'Enrollment Verification',
    value: 'Verify and manage student enrollment with accuracy.',
    color: 'from-emerald-500 to-green-700',
    metric: 'ID-based',
    status: 'Approval queue',
    audience: 'Students, registrar staff, and NSTP admins',
    preview: 'Student access begins with BiPSU student ID verification, admin approval, component preference capture, and enrollment history.',
    bullets: ['Pending student registrations are held for admin review', 'Duplicate email and student ID checks reduce bad records', 'Enrollment status follows students into the dashboard'],
    data: [
      { name: 'Verified', score: 76 },
      { name: 'Pending', score: 24 },
      { name: 'Duplicates', score: 6 },
    ],
  },
  {
    icon: ClipboardList,
    label: 'Assessments',
    value: 'Administer exams and measure knowledge readiness.',
    color: 'from-violet-500 to-purple-700',
    metric: '8 items',
    status: 'Post-tests and exams',
    audience: 'Students, facilitators, facilitators, and admins',
    preview: 'The assessment bank connects quizzes, major exams, answer keys, facilitator-uploaded materials, and readiness tracking.',
    bullets: ['Facilitators can upload lecture-linked assessments and answer keys', 'Students can access available tests from their portal', 'Admins can monitor coverage and published assessment status'],
    data: [
      { name: 'Published', score: 88 },
      { name: 'Drafts', score: 32 },
      { name: 'Answered', score: 74 },
    ],
  },
  {
    icon: ShieldCheck,
    label: 'Classification',
    value: 'Classify students into CWTS, LTS, MTS Army or Navy.',
    color: 'from-amber-400 to-orange-600',
    metric: '5 tracks',
    status: 'Rules-assisted',
    audience: 'NSTP coordinators and students',
    preview: 'Classification summarizes preferences, qualifying results, capacity, and official track assignment across CWTS, LTS, MTS Army, and MTS Navy.',
    bullets: ['Component distribution is visible to admins', 'Students see their official assigned component', 'Reports can surface uneven distribution early'],
    data: [
      { name: 'CWTS', score: 34 },
      { name: 'LTS', score: 28 },
      { name: 'MTS-A', score: 22 },
      { name: 'MTS-N', score: 16 },
    ],
  },
  {
    icon: Star,
    label: 'Grades',
    value: 'Compute and release NSTP grades securely and on time.',
    color: 'from-cyan-400 to-sky-700',
    metric: 'Official',
    status: 'Release-ready',
    audience: 'Students, facilitators, and NSTP admins',
    preview: 'The grade center gives students a clear released grade view while admins manage official status, completion records, and release readiness.',
    bullets: ['Students see released standing and progress signals', 'Admins can release grades after module and assessment requirements', 'Records stay connected to component and enrollment status'],
    data: [
      { name: 'Ready', score: 82 },
      { name: 'Pending', score: 18 },
      { name: 'Released', score: 64 },
    ],
  },
  {
    icon: BarChart3,
    label: 'Reports & Analytics',
    value: 'Real-time insights for better program decisions.',
    color: 'from-blue-500 to-indigo-700',
    metric: 'Live',
    status: 'Export-ready',
    audience: 'NSTP administrators and program coordinators',
    preview: 'Reports combine enrollment, module progress, assessment coverage, component distribution, grade release, and operational activity.',
    bullets: ['Dashboards show progress bands and component distribution', 'Report tools support monthly and program-level summaries', 'Search and filtering work across admin modules'],
    data: [
      { name: 'Progress', score: 91 },
      { name: 'Coverage', score: 86 },
      { name: 'Exports', score: 72 },
    ],
  },
];

const readinessBars = [
  { label: 'Modules', score: 100, value: '25h' },
  { label: 'Tests', score: 92, value: '8' },
  { label: 'ID Checks', score: 76, value: 'Live' },
  { label: 'Grades', score: 64, value: 'Ready' },
];

const impactBars = [
  { name: 'Civic', score: 88 },
  { name: 'Literacy', score: 82 },
  { name: 'Defense', score: 74 },
  { name: 'Resilience', score: 91 },
];

const workflowSteps = [
  'Common Module Deliver',
  'Enrollment Verify',
  'Assessments Administer',
  'Classification Assign',
  'Grades Release',
];

const dashboardStats = [
  { label: 'Common Module', value: 'In Progress', icon: BookOpen, tone: 'bg-blue-50 text-blue-700' },
  { label: 'Assessments', value: 'Completed', icon: CheckCircle, tone: 'bg-emerald-50 text-emerald-700' },
  { label: 'Classification', value: 'MTS Army', icon: ShieldCheck, tone: 'bg-violet-50 text-violet-700' },
  { label: 'NSTP Grade', value: '1.25', icon: Star, tone: 'bg-amber-50 text-amber-700' },
];

const trustItems = [
  { icon: LockKeyhole, title: 'Secure Platform', copy: 'Role-based access and data encryption protect every user.' },
  { icon: ShieldCheck, title: 'Privacy First', copy: 'Student records stay confidential and properly governed.' },
  { icon: Cloud, title: 'Always Available', copy: 'Access the portal anytime with reliable performance.' },
  { icon: Users, title: 'Built for BiPSU', copy: 'Designed for service, learning, and university excellence.' },
];

const buildOfficialName = (firstName: string, middleName: string, surname: string) => (
  `${firstName.trim()} ${middleName.trim()} ${surname.trim()}`.replace(/\s+/g, ' ').trim()
);

const buildCurrentAddress = (houseStreetPurok: string, barangay: string, municipality: string, province: string) => {
  return [houseStreetPurok, barangay, municipality, province]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ');
};

export default function LoginPage({ onLogin }: { onLogin: (user: AuthenticatedUser) => void }) {
  const [publicView, setPublicView] = useState<PublicView>('home');
  const [mode, setMode] = useState<LoginMode>('login');
  const [showAuth, setShowAuth] = useState(false);
  const [loginRole, setLoginRole] = useState<'student' | 'facilitator' | 'coordinator' | 'admin'>('student');
  const [surname, setSurname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [school, setSchool] = useState('');
  const [degreeProgram, setDegreeProgram] = useState('');
  const [preferredMtsBranch, setPreferredMtsBranch] = useState<'MTS (Army)' | 'MTS (Navy)'>('MTS (Army)');
  const [yearLevel, setYearLevel] = useState('');
  const [major, setMajor] = useState('');
  const [gender, setGender] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [houseStreetPurok, setHouseStreetPurok] = useState('');
  const [barangay, setBarangay] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [municipalityCode, setMunicipalityCode] = useState('');
  const [assignedMunicipality, setAssignedMunicipality] = useState('');
  const [province, setProvince] = useState('Biliran');
  const [provinces, setProvinces] = useState<Province[]>(() => getBuiltInProvinces());
  const [municipalities, setMunicipalities] = useState<Municipality[]>(() => getBuiltInMunicipalities('Biliran'));
  const [provincesLoading, setProvincesLoading] = useState(false);
  const [provincialAddress, setProvincialAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState<string>(SEEDED_CREDENTIALS.student.identifier);
  const [password, setPassword] = useState<string>(SEEDED_PASSWORD);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState(portalFeatures[0].label);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [selectedLandingComponent, setSelectedLandingComponent] = useState('CWTS');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('nstp-theme') === 'dark' ? 'dark' : 'light';
  });
  const [selectedCoordPillar, setSelectedCoordPillar] = useState<'CWTS' | 'LTS' | 'MTS'>('CWTS');
  const selectedSchoolPrograms = BIPSU_PROGRAMS.find((item) => item.school === school)?.programs || [];

  useEffect(() => {
    if (!province) {
      setAssignedMunicipality('');
      return;
    }
    if (province !== 'Biliran') {
      setAssignedMunicipality('Naval');
    } else {
      setAssignedMunicipality(municipality);
    }
  }, [province, municipality]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    localStorage.setItem('nstp-theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (publicView !== 'preview') return;
    const timer = window.setInterval(() => {
      setPreviewIndex((index) => (index + 1) % portalFeatures.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [publicView]);

  useEffect(() => {
    if (!showAuth && !mobileMenuOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAuth) setShowAuth(false);
        if (mobileMenuOpen) setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAuth, mobileMenuOpen]);

  useEffect(() => {
    fetchProvinces()
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          // Prioritize Biliran at index 0, followed alphabetically
          const sorted = [...res.data].sort((a, b) => {
            if (a.name === 'Biliran') return -1;
            if (b.name === 'Biliran') return 1;
            return a.name.localeCompare(b.name);
          });
          setProvinces(sorted);
        }
      })
      .catch(() => {
        // Fallback already active with built-in provinces
      });
  }, []);

  useEffect(() => {
    if (!province) {
      setMunicipalities([]);
      setMunicipality('');
      setMunicipalityCode('');
      return;
    }
    // Instantly switch to built-in municipalities for selected province (Zero wait/lockout!)
    const builtIn = getBuiltInMunicipalities(province);
    setMunicipalities(builtIn);

    const found = provinces.find((p) => p.name === province);
    if (found && found.code) {
      fetchMunicipalities(found.code)
        .then((res) => {
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            setMunicipalities(res.data);
          }
        })
        .catch(() => {
          // Fallback already active
        });
    }
  }, [province, provinces]);

  const showPublicView = (view: PublicView, featureLabel?: string, targetId = 'public-sections') => {
    if (featureLabel) {
      const nextIndex = portalFeatures.findIndex((feature) => feature.label === featureLabel);
      setSelectedFeature(featureLabel);
      if (nextIndex >= 0) setPreviewIndex(nextIndex);
    }
    setPublicView(view);
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  };

  const watchOverview = () => {
    setPreviewIndex(0);
    showPublicView('preview', portalFeatures[0].label, 'overview-carousel');
  };

  const performLogin = async (loginIdentifier: string, loginPass: string, expectedRole?: string) => {
    setError(null);
    setNotice(null);

    try {
      // Real HTTP request to POST /auth/login
      let apiResult = await apiPost<{ success: boolean; data: { user: Record<string, any> } } | null>(
        '/auth/login',
        { identifier: loginIdentifier, password: loginPass },
        null
      );
      if (apiResult === null) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        apiResult = await apiPost<{ success: boolean; data: { user: Record<string, any> } } | null>(
          '/auth/login',
          { identifier: loginIdentifier, password: loginPass },
          null
        );
      }

      if (apiResult?.success && apiResult?.data) {
        const userData = apiResult.data.user;
        const authenticatedUser = normalizeAuthenticatedUser(userData);
        if (!authenticatedUser) {
          setError('This account does not have a supported portal role. Ask an administrator to review the account.');
          return;
        }

        const backendRole = authenticatedUser.role;
        if (expectedRole && backendRole && backendRole !== expectedRole) {
          setError(`This account is registered as "${backendRole}", not "${expectedRole}". Please select the correct role.`);
          return;
        }

        setPassword('');
        onLogin(authenticatedUser);
        return;
      }

      if (apiResult === null) {
        setError('Cannot reach the server. Please check your connection and try again.');
        return;
      }

      if (apiResult && typeof apiResult === 'object' && 'success' in apiResult && !apiResult.success && 'error' in apiResult) {
        setError((apiResult as any).error);
        return;
      }

      setError(`Invalid ${loginRole === 'student' ? 'Student ID' : 'email'} or password.`);
    } catch (err: any) {
      const msg = err?.payload?.error || err?.payload?.message || err?.message || `Invalid ${loginRole === 'student' ? 'Student ID' : 'email'} or password.`;
      setError(msg);
    }
  };

  const selectCoordinatorPillar = (pillar: 'CWTS' | 'LTS' | 'MTS', autoLogin = false) => {
    setSelectedCoordPillar(pillar);
    const found = COORDINATOR_ACCOUNTS.find((c) => c.scope === pillar);
    if (found) {
      setEmail(found.identifier);
      setPassword(found.password);
      if (autoLogin) {
        void performLogin(found.identifier, found.password, 'coordinator');
      }
    }
    setError(null);
  };

  const selectDemoRole = (role: 'student' | 'facilitator' | 'coordinator' | 'admin', autoLogin = false) => {
    setLoginRole(role);
    if (role === 'coordinator') {
      const found = COORDINATOR_ACCOUNTS.find((c) => c.scope === selectedCoordPillar) || COORDINATOR_ACCOUNTS[0];
      setEmail(found.identifier);
      setPassword(found.password);
      if (autoLogin) {
        void performLogin(found.identifier, found.password, role);
      }
    } else {
      const creds = SEEDED_CREDENTIALS[role];
      if (creds) {
        setEmail(creds.identifier);
        setPassword(creds.password);
        if (autoLogin) {
          void performLogin(creds.identifier, creds.password, role);
        }
      }
    }
    setError(null);
  };

  const openAuth = (nextMode: LoginMode = 'login', initialRole: 'student' | 'facilitator' | 'coordinator' | 'admin' = 'student') => {
    setMode(nextMode);
    setShowAuth(true);
    setError(null);
    setNotice(null);
    if (nextMode === 'login') {
      selectDemoRole(initialRole);
    } else {
      setLoginRole(initialRole);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setError(null);

    if (mode === 'register') {
      const cleanStudentId = studentId.trim();
      if (!cleanStudentId) {
        setError('Enter your BiPSU student ID for registrar verification.');
        return;
      }

      if (!surname.trim() || !firstName.trim() || !school || !degreeProgram.trim() || !gender.trim() || !birthdate.trim() || !province || !barangay.trim() || !contactNumber.trim() || !email.trim() || !password || !confirmPassword) {
        setError('Complete the required official student profile fields before submission.');
        return;
      }

      if (province === 'Biliran' && !municipality) {
        setError('Municipality is required for Biliran residents.');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setError('Enter a valid email address.');
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }

      if (!yearLevel) {
        setError('Year Level is required.');
        return;
      }

      if (isProgramWithMajor(degreeProgram) && !major) {
        setError(`Major is required for ${degreeProgram}.`);
        return;
      }

      if (!barangay.trim()) {
        setError('Barangay is required.');
        return;
      }

      if (!municipality) {
        setError('Municipality is required.');
        return;
      }

      if (!province.trim()) {
        setError('Province is required.');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      const pendingRequest = {
        id: `pending-${Math.random().toString(36).slice(2, 10)}`,
        studentId: cleanStudentId,
        surname: surname.trim(),
        firstName: firstName.trim(),
        middleName: middleName.trim(),
        name: buildOfficialName(firstName, middleName, surname),
        email: email.trim(),
        password,
        school,
        department: school,
        degreeProgram: degreeProgram.trim(),
        yearLevel,
        ...(isProgramWithMajor(degreeProgram) ? { major } : {}),
        gender,
        birthdate,
        houseStreetPurok: houseStreetPurok.trim(),
        barangay: barangay.trim(),
        municipality,
        province: province.trim(),
        assignedMunicipality,
        currentAddress: buildCurrentAddress(houseStreetPurok, barangay, assignedMunicipality, province),
        provincialAddress: provincialAddress.trim(),
        contactNumber: contactNumber.trim(),
        preferredComponent: isCriminologyProgram(degreeProgram, school)
          ? preferredMtsBranch
          : isTeacherEducationProgram(degreeProgram, school)
          ? 'LTS'
          : 'CWTS',
        createdAt: new Date().toISOString(),
      };

      const submission = await apiPost<{ success: boolean } | null>('/auth/pending-registration', pendingRequest, null);
      if (!submission?.success) {
        setError('Unable to submit your registration. Please try again.');
        return;
      }

      setNotice('Registration submitted. Please wait for admin approval before signing in.');
      setSurname('');
      setFirstName('');
      setMiddleName('');
      setStudentId('');
      setSchool('');
      setDegreeProgram('');
      setYearLevel('');
      setMajor('');
      setGender('');
      setBirthdate('');
      setHouseStreetPurok('');
      setBarangay('');
      setMunicipality('');
      setMunicipalityCode('');
      setAssignedMunicipality('');
      setProvince('');
      setProvincialAddress('');
      setContactNumber('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setMode('login');
      return;
    }

    const loginInput = email.trim();
    if (!loginInput || !password) {
      setError(`Please enter your ${loginRole === 'student' ? 'Student ID' : 'email'} and password.`);
      return;
    }

    try {
      await performLogin(loginInput, password, loginRole);
    } catch (err: any) {
      const msg = err?.payload?.error || err?.payload?.message || err?.message || 'Failed to sign in. Please check your credentials.';
      setError(msg);
    }
  };

  return (
    <div className="landing-page min-h-screen bg-[#edf5fb] text-[#061a42] dark:bg-[#08111f] dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#061f4f] text-white shadow-[0_10px_30px_-20px_rgba(2,6,23,0.8)]">
        <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3 lg:px-12">
          <button onClick={() => showPublicView('home')} className="flex min-w-0 items-center gap-2 text-left sm:gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm sm:h-13 sm:w-13 sm:rounded-2xl sm:p-1.5">
              <img src="/bipsu-logo.png" alt="Biliran Province State University logo" className="h-full w-full object-contain" />
            </span>
            <span className="flex min-w-0 items-center gap-2.5 sm:gap-4">
              <span className="font-brand hidden border-r border-white/40 pr-4 text-2xl font-semibold tracking-tight sm:block sm:text-3xl sm:pr-5">BiPSU</span>
              <span className="min-w-0">
                <span className="font-portal block truncate text-sm font-semibold uppercase leading-tight tracking-[0.14em] sm:text-xl sm:tracking-[0.22em] lg:text-2xl">NSTP Portal</span>
                <span className="block truncate text-[10px] font-bold uppercase leading-tight tracking-[0.05em] text-white/80 sm:text-xs">National Service Training Program</span>
              </span>
            </span>
          </button>

          <nav className="hidden items-center gap-7 lg:flex">
            {[
              ['nstp', 'About NSTP'],
              ['school', 'Guidelines'],
              ['portal', 'FAQs'],
              ['school', 'Contact'],
            ].map(([id, label]) => (
              <button
                key={label}
                onClick={() => showPublicView(id as PublicView)}
                className="rounded-full px-2 py-2 text-sm font-semibold uppercase tracking-tight text-white/88 hover:text-white"
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
              className="inline-flex h-9 w-9 sm:h-10 items-center justify-center rounded-xl border border-blue-300/70 bg-white/5 text-xs font-semibold uppercase tracking-tight text-white shadow-sm hover:bg-white/12 sm:w-auto sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-sm"
              aria-label="Toggle landing page theme"
            >
              {themeMode === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              <span className="hidden sm:inline">{themeMode === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              onClick={() => openAuth('login')}
              className="inline-flex h-9 sm:min-h-10 items-center justify-center gap-1.5 rounded-xl border border-blue-300/70 bg-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-tight text-white shadow-sm hover:bg-white/20 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <LockKeyhole className="h-4 w-4" />
              <span>Login</span>
            </button>
            <button
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/20 text-white hover:bg-white/10 lg:hidden"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-4 w-4 sm:h-5 sm:w-5" /> : <Menu className="h-4 w-4 sm:h-5 sm:w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer with Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-[52px] sm:top-[57px] z-50 flex flex-col bg-[#051c44]/95 p-5 backdrop-blur-md lg:hidden">
            <div className="grid gap-2">
              {[
                ['nstp', 'About NSTP'],
                ['school', 'Guidelines'],
                ['portal', 'FAQs'],
                ['school', 'Contact'],
              ].map(([id, label]) => (
                <button
                  key={label}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    showPublicView(id as PublicView);
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-left text-sm font-semibold uppercase tracking-wide text-white hover:bg-white/15"
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuth('register');
                }}
                className="mt-2 rounded-xl bg-[#ffd24d] px-4 py-3.5 text-center text-sm font-bold uppercase tracking-wider text-[#061a42] shadow-md hover:bg-[#ffe17d]"
              >
                Request Student Access
              </button>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 py-3 text-xs font-semibold uppercase text-white/80 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
              Close Menu
            </button>
          </div>
        )}
      </header>

      <main className="overflow-x-hidden">
        <section className="relative isolate min-h-[calc(100svh-4.5rem)] overflow-hidden bg-[#f7fbff] dark:bg-[#07111f]">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-[0.16] saturate-[0.85] dark:opacity-[0.18] dark:saturate-[0.72] pointer-events-none"
            style={{ backgroundImage: `url(${splashImage})` }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.92)_34%,rgba(237,246,255,0.76)_62%,rgba(214,233,248,0.88)_100%)] dark:bg-[radial-gradient(circle_at_50%_24%,rgba(15,34,65,0.94)_0%,rgba(7,17,31,0.9)_42%,rgba(5,13,27,0.96)_100%)] pointer-events-none" />
          <div className="absolute left-[-7rem] top-[-7rem] h-80 w-80 rounded-full border border-blue-200/70 dark:border-blue-300/12 pointer-events-none" />
          <div className="absolute left-[-5rem] top-[-3rem] h-72 w-72 rounded-full border border-blue-200/50 dark:border-blue-300/10 pointer-events-none" />
          <div className="absolute right-0 top-0 h-64 w-64 bg-[radial-gradient(circle,rgba(11,78,162,0.08)_1.5px,transparent_1.5px)] [background-size:14px_14px] dark:bg-[radial-gradient(circle,rgba(147,197,253,0.13)_1.5px,transparent_1.5px)] pointer-events-none" />

          {/* Smooth bottom transition */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#edf5fb] to-transparent dark:from-[#08111f] dark:to-transparent sm:h-24 pointer-events-none" />
          <div className="hidden sm:block absolute inset-x-0 bottom-0 h-24 bg-[#06245c] pointer-events-none" />
          <div className="hidden sm:block absolute bottom-0 left-0 h-24 w-[72%] rounded-tr-[100%] bg-[#06245c] pointer-events-none" />
          <div className="hidden sm:block absolute bottom-0 right-0 h-24 w-[42%] rounded-tl-[100%] bg-[#f2b705] pointer-events-none" />
          <div className="hidden sm:block absolute bottom-0 left-[42%] h-12 w-[38%] rounded-t-[100%] bg-[#0b4ea2] pointer-events-none" />

          <div className="relative mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-5xl flex-col items-center justify-center px-4 pb-16 pt-8 text-center sm:px-8 sm:pb-28 sm:pt-12">
            <img src="/bipsu-logo.png" alt="Biliran Province State University logo" className="h-20 w-20 rounded-full bg-white/90 p-1.5 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.55)] ring-1 ring-blue-100 dark:bg-white dark:ring-blue-300/30 sm:h-28 sm:w-28 sm:p-2" />
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0b4ea2] dark:text-blue-200 sm:mt-6 sm:text-xs sm:tracking-[0.28em] md:text-sm md:tracking-[0.38em]">
              Biliran Province State University
            </p>
            <span className="mt-3.5 h-1 w-10 rounded-full bg-[#f2b705] sm:mt-5 sm:w-12" />
            <h1 className="mt-4 font-portal text-4xl font-semibold leading-none tracking-tight text-[#12366f] dark:text-white sm:mt-6 sm:text-6xl lg:text-7xl">
              Welcome
            </h1>
            <p className="mt-3.5 max-w-2xl text-base font-medium leading-relaxed text-slate-600 dark:text-slate-300 sm:mt-5 sm:text-xl lg:text-2xl">
              NSTP Portal for Brilliance, Innovation, Progress, Service and Unity
            </p>

            <div className="mt-6 grid w-full max-w-sm grid-cols-3 gap-2.5 sm:mt-8 sm:max-w-md sm:gap-4" role="tablist" aria-label="NSTP components">
              {landingComponents.map((component) => (
                <button
                  key={component.key}
                  role="tab"
                  aria-selected={selectedLandingComponent === component.key}
                  onClick={() => setSelectedLandingComponent(component.key)}
                  className={`rounded-full border px-3 py-2.5 text-sm font-semibold tracking-wide shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-md dark:hover:bg-slate-900 sm:px-6 sm:py-3.5 sm:text-base ${
                    selectedLandingComponent === component.key
                      ? component.key === 'MTS'
                        ? 'border-[#f2b705] bg-[#f2b705]/15 text-[#b77900] ring-2 ring-[#f2b705]/40 dark:bg-[#f2b705]/20 dark:text-amber-100'
                        : 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/30 dark:border-blue-300/60 dark:bg-blue-500/20 dark:text-blue-100'
                      : component.key === 'MTS'
                      ? 'border-[#f2b705]/60 bg-white/70 text-[#c48600] dark:bg-slate-950/55 dark:text-amber-200'
                      : 'border-blue-300 bg-white/70 text-blue-700 dark:border-blue-400/40 dark:bg-slate-950/55 dark:text-blue-100'
                  }`}
                >
                  {component.key}
                </button>
              ))}
            </div>

            <div className="mt-5 w-full max-w-2xl rounded-2xl border border-blue-100 bg-white/80 p-4 text-left shadow-[0_18px_48px_-36px_rgba(15,23,42,0.5)] backdrop-blur dark:border-blue-300/15 dark:bg-slate-950/70 sm:rounded-3xl sm:p-6">
              {landingComponents.filter((component) => component.key === selectedLandingComponent).map((component) => (
                <div key={component.key}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">{component.key} component</p>
                  <h2 className="mt-1 text-lg font-semibold text-[#12366f] dark:text-white sm:text-xl">{component.title}</h2>
                  <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300 sm:text-sm sm:leading-6">{component.copy}</p>
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {component.focus.map((item) => (
                      <span key={item} className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex w-full max-w-md sm:max-w-xl flex-col items-center gap-3">
              <div className="grid w-full gap-2.5 sm:grid-cols-2 sm:gap-4">
                <button onClick={() => openAuth('login')} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[#073f9f] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_-15px_rgba(7,63,159,0.85)] transition-all hover:-translate-y-0.5 hover:bg-[#052e77] active:translate-y-0">
                  <ShieldCheck className="h-5 w-5" />
                  Secure Login
                </button>
                <button onClick={watchOverview} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white/80 px-6 py-3 text-sm font-semibold text-[#0b2d75] shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white active:translate-y-0 dark:border-blue-400/30 dark:bg-slate-950/70 dark:text-blue-100 dark:hover:bg-slate-900">
                  <PlayCircle className="h-4 w-4" />
                  Watch Overview
                </button>
              </div>
            </div>

            <div className="mt-8 grid w-full max-w-2xl grid-cols-3 gap-2 text-center text-xs text-[#1f3760] dark:text-slate-300 sm:gap-4 sm:text-sm">
              {[
                [ShieldCheck, 'Blue & gold identity'],
                [IdCard, 'Student ID verification'],
                [GraduationCap, 'Grades & clearance'],
              ].map(([Icon, label]) => {
                const ItemIcon = Icon as typeof ShieldCheck;
                return (
                  <div key={label as string} className="flex flex-col items-center gap-2 rounded-xl p-2 sm:border-r sm:border-blue-100/80 sm:last:border-r-0 dark:sm:border-blue-300/15">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-800 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-100 dark:ring-blue-300/20 sm:h-12 sm:w-12">
                      <ItemIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                    </span>
                    <span className="font-medium leading-tight">{label as string}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative z-10 mx-auto mt-4 max-w-[1460px] px-3 sm:-mt-10 sm:px-5 lg:px-9">
          <div className="grid grid-cols-2 gap-2.5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2.5 shadow-[0_22px_56px_-34px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6 lg:p-0">
            {portalFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <button
                  key={feature.label}
                  onClick={() => showPublicView('feature', feature.label)}
                  className="group flex flex-col items-center justify-between rounded-xl border border-slate-100 p-3 text-center transition-all hover:bg-blue-50/70 hover:shadow-sm dark:border-slate-800/80 dark:hover:bg-slate-800/50 sm:p-4 lg:min-h-[12rem] lg:rounded-none lg:border-0 lg:border-r lg:border-slate-200 lg:p-6 lg:dark:border-slate-800"
                >
                  <span className={`mb-2 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${feature.color} text-white shadow-md shadow-slate-900/10 sm:h-12 sm:w-12 sm:rounded-2xl lg:mb-4 lg:h-14 lg:w-14`}>
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </span>
                  <span className="text-xs font-semibold leading-tight text-[#061a42] dark:text-slate-100 sm:text-sm">{feature.label}</span>
                  <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#30476d] dark:text-slate-300 sm:text-xs">{feature.value}</span>
                  <span className="mt-2.5 inline-block rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 group-hover:border-blue-200 group-hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:text-[11px]">
                    {feature.metric}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section id="public-sections" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-10">
          {publicView === 'home' && <HomeSections onStart={() => openAuth('register')} />}
          {publicView === 'nstp' && <NstpSections />}
          {publicView === 'school' && <SchoolSections />}
          {publicView === 'portal' && <PortalSections onLogin={() => openAuth('login')} />}
          {publicView === 'feature' && <FeatureSections feature={portalFeatures.find((feature) => feature.label === selectedFeature) || portalFeatures[0]} onPreview={watchOverview} />}
          {publicView === 'preview' && <OverviewPreviewCarousel activeIndex={previewIndex} onSelect={setPreviewIndex} onLogin={() => openAuth('login')} />}
        </section>

        <TrustBand />
      </main>

      {showAuth && (
        <div className="fixed inset-0 z-50 overflow-auto bg-slate-950/70 p-3 backdrop-blur-sm md:p-6">
          <div className="mx-auto grid min-h-full max-w-6xl items-center">
            <div className="grid overflow-hidden rounded-2xl border border-blue-200/70 bg-white shadow-[0_25px_65px_-28px_rgba(11,78,162,0.45)] dark:border-slate-700 dark:bg-slate-950 lg:grid-cols-[0.86fr_1.14fr]">
              <section className="relative hidden bg-[#06245c] p-8 text-white lg:block">
                <div className="absolute inset-0 bg-[#06245c]" />
                <div className="absolute inset-x-0 top-0 h-1 bg-[#f2b705]" />
                <div className="relative">
                  <div className="mb-6 flex items-center gap-3">
                    <img src="/bipsu-logo.png" alt="Biliran Province State University logo" className="h-16 w-16 rounded-2xl bg-white p-2" />
                    <img src={nstpLogo} alt="NSTP logo" className="h-16 w-16 rounded-2xl bg-white p-2" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">Official BiPSU NSTP Portal</p>
                  <h2 className="mt-2 text-3xl font-semibold">Secure access for enrollment, learning records, and NSTP administration.</h2>
                  <div className="mt-8 space-y-3">
                    {['Student ID approval before access', 'Role-based dashboards for students, facilitators, and admins', 'Grades, reports, modules, and exams in one portal'].map((item) => (
                      <div key={item} className="flex items-center gap-3 rounded-xl border border-white/18 bg-white/10 p-3 text-sm font-semibold">
                        <CheckCircle className="h-4 w-4 text-[#ffd24d]" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="p-4 sm:p-6 md:p-10">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2.5 flex items-center gap-2 lg:hidden">
                      <img src="/bipsu-logo.png" alt="Biliran Province State University logo" className="h-9 w-9 rounded-xl border border-blue-100 bg-white p-1" />
                      <img src={nstpLogo} alt="NSTP logo" className="h-9 w-9 rounded-xl border border-blue-100 bg-white p-1" />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Portal Access</p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">{mode === 'login' ? 'Sign in to continue' : 'Request student access'}</h2>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
                      {mode === 'login'
                        ? 'Access modules, assessments, grades, announcements, reports, and enrollment tools.'
                        : 'Use your BiPSU student ID. Admin approval is required before login.'}
                    </p>
                  </div>
                  <button onClick={() => setShowAuth(false)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:text-sm">
                    Close
                  </button>
                </div>

                <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
                  {(['login', 'register'] as LoginMode[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setMode(item);
                        setError(null);
                        if (item === 'login') {
                          selectDemoRole(loginRole);
                        } else {
                          setEmail('');
                          setPassword('');
                          setConfirmPassword('');
                        }
                      }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors sm:text-sm ${mode === item ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                    >
                      {item === 'login' ? 'Login' : 'Register'}
                    </button>
                  ))}
                </div>

                {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">{notice}</div>}
                {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">{error}</div>}

                <form onSubmit={handleSubmit} className="grid gap-4">
                  {mode === 'register' && (
                    <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 sm:max-h-[65vh]">
                      <FormSection title="Student Information">
                        <Field label="BiPSU Student ID" icon={IdCard} value={studentId} onChange={setStudentId} placeholder="2026-0000" required />
                        <Field label="Surname" value={surname} onChange={setSurname} placeholder="Dela Cruz" required />
                        <Field label="First Name" value={firstName} onChange={setFirstName} placeholder="Juan" required />
                        <Field label="Middle Name" value={middleName} onChange={setMiddleName} placeholder="Santos" optional />
                        <SelectField label="Gender" value={gender} onChange={setGender} required options={['Female', 'Male', 'Prefer not to say']} placeholder="Select gender" />
                        <Field label="Birthdate" type="date" value={birthdate} onChange={setBirthdate} placeholder="Birthdate" required />
                      </FormSection>

                      <FormSection title="Academic Information">
                        <SelectField
                          label="School / College / Department"
                          value={school}
                          onChange={(value) => {
                            setSchool(value);
                            setDegreeProgram('');
                            setMajor('');
                          }}
                          required
                          options={BIPSU_PROGRAMS.map((item) => item.school)}
                          placeholder="Select your school"
                        />
                        <SelectField
                          label="Degree Program"
                          value={degreeProgram}
                          onChange={(value) => {
                            setDegreeProgram(value);
                            if (!isProgramWithMajor(value)) setMajor('');
                          }}
                          required
                          options={selectedSchoolPrograms}
                          placeholder={school ? 'Select your degree program' : 'Select a school first'}
                          disabled={!school}
                        />

                        {degreeProgram && isCriminologyProgram(degreeProgram, school) && (
                          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                            <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200 mb-1">
                              <Shield className="w-4 h-4 text-amber-600" />
                              <span>Mandatory Track Routing: Military Training Service (MTS / ROTC)</span>
                            </div>
                            <p className="mb-2.5 text-slate-700 dark:text-slate-300">
                              Students in the School of Criminal Justice Education (BS in Criminology) are automatically routed to the Military Training Service (ROTC) track. Please select your service branch:
                            </p>
                            <SelectField
                              label="MTS Service Branch"
                              value={preferredMtsBranch}
                              onChange={(val) => setPreferredMtsBranch(val as 'MTS (Army)' | 'MTS (Navy)')}
                              required
                              options={['MTS (Army)', 'MTS (Navy)']}
                              placeholder="Select military branch"
                            />
                          </div>
                        )}

                        {degreeProgram && isTeacherEducationProgram(degreeProgram, school) && (
                          <div className="rounded-xl border border-blue-300 bg-blue-50 p-3.5 text-xs text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                            <div className="flex items-center gap-1.5 font-semibold text-blue-800 dark:text-blue-200 mb-1">
                              <Shield className="w-4 h-4 text-blue-600" />
                              <span>Mandatory Track Routing: Literacy Training Service (LTS)</span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300">
                              Students in the School of Teacher Education are automatically routed to the Literacy Training Service (LTS) to prepare for specialized community literacy and numeracy tutorials in Biliran schools.
                            </p>
                          </div>
                        )}
                        <SelectField
                          label="Year Level"
                          value={yearLevel}
                          onChange={setYearLevel}
                          required
                          options={YEAR_LEVEL_OPTIONS}
                          placeholder="Select year level"
                        />
                        {isProgramWithMajor(degreeProgram) && (
                          <SelectField
                            label="Major"
                            value={major}
                            onChange={setMajor}
                            required
                            options={degreeProgram === INDUSTRIAL_TECHNOLOGY_PROGRAM ? INDUSTRIAL_TECHNOLOGY_MAJORS : SECONDARY_EDUCATION_MAJORS}
                            placeholder="Select major"
                          />
                        )}
                      </FormSection>

                      <FormSection title="Contact and Address">
                        <Field label="Contact Number" value={contactNumber} onChange={setContactNumber} placeholder="09xx xxx xxxx" required />
                        <Field
                          label="House No. / Street / Purok"
                          value={houseStreetPurok}
                          onChange={setHouseStreetPurok}
                          placeholder="Example: Purok 2, M.H. Del Pilar St."
                          optional
                          helper="You may include your house number, street, or purok."
                        />
                        <SelectField
                          label="Province"
                          value={province}
                          onChange={(value) => {
                            setProvince(value);
                            setMunicipality('');
                            setMunicipalityCode('');
                            setBarangay('');
                          }}
                          required
                          options={provinces.map((p) => p.name)}
                          placeholder="Select province"
                          disabled={false}
                          helper="Select your home province (Biliran prioritized)."
                        />
                        <SelectField
                          label="Municipality"
                          value={municipality}
                          onChange={(value) => {
                            setMunicipality(value);
                            const found = municipalities.find((m) => m.name === value);
                            setMunicipalityCode(found ? found.code : '');
                            setBarangay('');
                          }}
                          required
                          options={municipalities.map((m) => m.name)}
                          placeholder={!province ? 'Select a province first' : 'Select municipality'}
                          disabled={!province}
                          helper={province === 'Biliran' ? 'Select your Biliran municipality (determines NSTP field assignment).' : 'Your home municipality.'}
                        />
                        <BarangaySearch
                          municipalityCode={municipalityCode}
                          municipalityName={municipality}
                          value={barangay}
                          onChange={setBarangay}
                          required
                        />
                        <Field label="Provincial Address" value={provincialAddress} onChange={setProvincialAddress} placeholder="Permanent home address" optional helper="Optional if same as current address." />
                      </FormSection>
                      <FormSection title="NSTP Assignment">
                        <Field
                          label="Assigned Municipality (NSTP)"
                          value={assignedMunicipality}
                          onChange={() => {}}
                          placeholder="Auto-determined"
                          readOnly
                          helper="Automatically assigned for facilitator routing. Biliran students use their municipality; non-Biliran students are assigned to Naval."
                        />
                      </FormSection>
                    </div>
                  )}

                  {mode === 'register' ? (
                    <FormSection title="Account Security">
                      <Field label="Email Address" icon={Mail} type="email" value={email} onChange={setEmail} placeholder="student@bipsu.edu.ph" required />
                      <Field label="Password" icon={Lock} type="password" value={password} onChange={setPassword} placeholder="Enter your password" required />
                      <Field label="Confirm Password" icon={Lock} type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter your password" required />
                    </FormSection>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(['student', 'facilitator', 'coordinator', 'admin'] as const).map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => selectDemoRole(role)}
                            className={`rounded-xl px-2.5 py-2.5 text-center text-xs font-bold uppercase tracking-tight transition-colors sm:text-sm ${
                              loginRole === role
                                ? 'bg-blue-700 text-white shadow-sm ring-2 ring-blue-500/20'
                                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>

                      {loginRole === 'coordinator' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pillar:</span>
                          {COORDINATOR_ACCOUNTS.map((c) => (
                            <button
                              key={c.scope}
                              type="button"
                              onClick={() => selectCoordinatorPillar(c.scope)}
                              className={`flex-1 rounded-lg px-2 py-1 text-center text-xs font-bold transition-colors ${
                                selectedCoordPillar === c.scope
                                  ? 'bg-blue-700 text-white shadow-xs'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Seeded Account Indicator Card */}
                      {(() => {
                        const activeCreds = loginRole === 'coordinator'
                          ? (COORDINATOR_ACCOUNTS.find((c) => c.scope === selectedCoordPillar) || COORDINATOR_ACCOUNTS[0])
                          : SEEDED_CREDENTIALS[loginRole];

                        return (
                          <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 p-3.5 text-left dark:border-blue-900/50 dark:from-blue-950/40 dark:to-indigo-950/30">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-900 dark:text-blue-200">
                                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                {activeCreds.title}
                              </span>
                              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                                {activeCreds.badge}
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between">
                              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                Account: <span className="font-semibold text-slate-900 dark:text-white">{activeCreds.name}</span>
                              </p>
                              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                PW: {SEEDED_PASSWORD}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                              {activeCreds.features[0]}
                            </p>
                            {import.meta.env.DEV && (
                              <div className="mt-2.5 pt-2 border-t border-blue-200/60 dark:border-blue-900/40">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (loginRole === 'coordinator') {
                                      selectCoordinatorPillar(selectedCoordPillar, true);
                                    } else {
                                      selectDemoRole(loginRole, true);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200"
                                >
                                  <Sparkles className="h-3 w-3 text-amber-500" />
                                  Quick Login as {activeCreds.name} (via POST /auth/login)
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <Field
                        label={loginRole === 'student' ? 'Student ID' : 'Email'}
                        icon={Mail}
                        type="text"
                        value={email}
                        onChange={setEmail}
                        placeholder={loginRole === 'student' ? 'Enter your Student ID' : 'Enter your email'}
                        required
                      />
                      <Field label="Password" icon={Lock} type="password" value={password} onChange={setPassword} placeholder="Enter your password" required />
                    </>
                  )}

                  <button type="submit" className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 font-semibold text-white shadow-sm ring-1 ring-blue-800/10 hover:bg-blue-800 active:bg-blue-900">
                    {mode === 'login' ? 'Continue to Dashboard' : 'Submit Registration'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>

              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative hidden lg:block">
      <div className="absolute -left-8 bottom-4 h-24 w-24 rounded-full bg-[#0b4ea2]/10 blur-2xl" />
      <div className="overflow-hidden rounded-[1.5rem] border border-blue-100 bg-white shadow-[0_30px_90px_-36px_rgba(15,45,90,0.55)]">
        <div className="grid min-h-[520px] grid-cols-[170px_1fr]">
          <aside className="bg-[linear-gradient(180deg,#082b66,#031a41)] p-5 text-white">
            <p className="font-brand text-2xl font-semibold leading-none">BiPSU</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-100">NSTP Portal</p>
            <nav className="mt-7 space-y-2">
              {[
                { icon: BarChart3, label: 'Dashboard', active: true },
                { icon: BookOpen, label: 'Common Module' },
                { icon: ListChecks, label: 'Enrollment' },
                { icon: ClipboardList, label: 'Assessments' },
                { icon: Users, label: 'Classification' },
                { icon: Award, label: 'Grades' },
                { icon: FileText, label: 'Reports' },
                { icon: Megaphone, label: 'Announcements' },
                { icon: Download, label: 'Downloads' },
                { icon: Settings, label: 'Settings' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold ${item.active ? 'bg-white/16 text-white shadow-sm' : 'text-white/78'}`}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </div>
                );
              })}
            </nav>
          </aside>

          <div className="bg-white p-5">
            <div className="mb-5 flex items-center justify-between">
              <Menu className="h-5 w-5 text-slate-400" />
              <div className="flex items-center gap-4">
                <Bell className="h-4 w-4 text-slate-400" />
                <span className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#d8e6f7,#8da4c6)] ring-2 ring-blue-100" />
              </div>
            </div>

            <p className="text-sm font-semibold text-slate-500">Welcome back, <span className="text-slate-900">Juan Dela Cruz</span></p>
            <p className="mt-1 text-xs font-semibold text-slate-400">Student</p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {dashboardStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className={`rounded-xl p-4 ${stat.tone}`}>
                    <p className="text-xs font-semibold text-slate-900">{stat.label}</p>
                    <p className="mt-2 text-sm font-semibold">{stat.value}</p>
                    <div className="mt-3 flex justify-end">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-white/70">
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-slate-900">NSTP Workflow</p>
              <div className="relative grid grid-cols-5 gap-2">
                <div className="absolute left-[9%] right-[9%] top-5 h-1 rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-emerald-500" />
                {workflowSteps.map((step, index) => (
                  <div key={step} className="relative text-center">
                    <span className={`mx-auto grid h-10 w-10 place-items-center rounded-full border-4 border-white text-sm font-semibold text-white shadow ${index === workflowSteps.length - 1 ? 'bg-emerald-500' : 'bg-blue-600'}`}>
                      {index === workflowSteps.length - 1 ? <CheckCircle className="h-5 w-5" /> : index + 1}
                    </span>
                    <p className="mt-2 text-[11px] font-bold leading-tight text-slate-700">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-[1.05fr_0.95fr] gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-2 text-sm font-semibold text-slate-900">Classification Overview</p>
                <div className="grid grid-cols-[130px_1fr] items-center gap-3">
                  <div className="grid h-32 place-items-center">
                    <div className="relative h-28 w-28 rounded-full bg-[conic-gradient(#10b981_0_34%,#2563eb_34%_62%,#f59e0b_62%_84%,#6366f1_84%_100%)]">
                      <span className="absolute inset-7 rounded-full bg-white" />
                      <span className="absolute inset-0 grid place-items-center text-xs font-semibold text-slate-800">1,248</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs font-bold">
                    {componentCards.map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.fill }} />{item.label}</span>
                        <span>{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Announcements</p>
                  <span className="text-xs font-semibold text-blue-700">View all</span>
                </div>
                {[
                  { title: 'Common Module Schedule', date: 'May 24, 2026', Icon: CalendarDays },
                  { title: 'Assessment Guidelines', date: 'May 20, 2026', Icon: BookOpen },
                  { title: 'NSTP Orientation', date: 'May 15, 2026', Icon: Megaphone },
                ].map(({ title, date, Icon }) => {
                  const ItemIcon = Icon;
                  return (
                    <div key={String(title)} className="flex items-center gap-3 border-t border-slate-100 py-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700">
                        <ItemIcon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-xs font-semibold text-slate-900">{title}</span>
                        <span className="block text-[11px] font-semibold text-slate-400">{date}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrustBand() {
  return (
    <section className="relative overflow-hidden bg-[#05275f] text-white">
      <div
        className="absolute inset-y-0 right-0 w-[42%] bg-cover bg-center opacity-30 pointer-events-none"
        style={{ backgroundImage: `url(${splashImage})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#05275f_0%,#07316e_60%,rgba(5,39,95,0.85)_100%)] pointer-events-none" />
      <div className="relative mx-auto grid max-w-[1540px] gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[1fr_auto] lg:px-12">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {trustItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex items-start gap-3 rounded-xl bg-white/5 p-3.5 backdrop-blur-sm sm:bg-transparent sm:p-0">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-blue-300/30 bg-white/10 text-blue-200 sm:h-13 sm:w-13">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div>
                  <span className="block text-sm font-semibold sm:text-base">{item.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-white/80 sm:text-sm sm:leading-6">{item.copy}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-white/15 pt-4 text-center sm:text-left lg:border-t-0 lg:pt-0 lg:self-end lg:text-right">
          <p className="text-2xl font-semibold sm:text-3xl">Serve. Learn. Excel.</p>
          <p className="mt-1 text-lg font-semibold text-[#ffd24d] sm:text-xl">#NSTPsaBiPSU</p>
        </div>
      </div>

      {/* Official Institutional University Footer */}
      <footer className="border-t border-white/10 bg-[#031535] px-4 py-8 text-white/80 sm:px-6 sm:py-10 lg:px-12">
        <div className="mx-auto grid max-w-[1540px] gap-8 text-xs sm:grid-cols-2 sm:text-sm lg:grid-cols-4">
          <div>
            <div className="mb-3 flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-lg bg-white p-1">
                <img src="/bipsu-logo.png" alt="BiPSU" className="h-full w-full object-contain" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white">BiPSU NSTP Portal</p>
                <p className="text-[10px] text-white/60">Republic of the Philippines</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-white/70">
              Biliran Province State University — Directorate of the National Service Training Program. Implementing R.A. 9163 for civic consciousness and defense readiness.
            </p>
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-blue-200">Campus Address</p>
            <p className="text-xs leading-relaxed text-white/70">
              BiPSU Main Campus<br />
              P.I. Garcia Street, Barangay San Roque<br />
              Naval, Biliran Province, 6543 Philippines
            </p>
            <p className="mt-2 text-xs text-white/70">Office: Student Affairs & Services (SAS) Bldg.</p>
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-blue-200">Official Tracks</p>
            <ul className="space-y-1.5 text-xs text-white/70">
              <li>• Civic Welfare Training Service (CWTS)</li>
              <li>• CWTS Coast Guard Track</li>
              <li>• Literacy Training Service (LTS)</li>
              <li>• Military Training Service (MTS Army & Navy)</li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-blue-200">Inquiries & Governance</p>
            <p className="text-xs leading-relaxed text-white/70">
              Email: <span className="text-blue-300">nstp@bipsu.edu.ph</span><br />
              Registrar: <span className="text-blue-300">registrar@bipsu.edu.ph</span><br />
              Office Hours: Mon – Fri: 8:00 AM – 5:00 PM
            </p>
            <p className="mt-3 text-[11px] text-white/50">
              © 2026 Biliran Province State University. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </section>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <h3 className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-blue-800 dark:text-blue-200">{title}</h3>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function RequiredMark({ required, optional }: { required?: boolean; optional?: boolean }) {
  if (required) return <span className="text-rose-600 dark:text-rose-300">*</span>;
  if (optional) return <span className="text-xs font-semibold text-slate-400">Optional</span>;
  return null;
}

function Field({ label, icon: Icon, value, onChange, placeholder, type = 'text', required = false, optional = false, helper, readOnly = false }: { label: string; icon?: any; value: string; onChange: (value: string) => void; placeholder: string; type?: string; required?: boolean; optional?: boolean; helper?: string; readOnly?: boolean }) {
  const isPassword = type === 'password';
  const [showPassword, setShowPassword] = useState(false);
  const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type;
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        <span>{label} <RequiredMark required={required} /></span>
        <RequiredMark optional={optional} />
      </span>
      <span className="relative block">
        {Icon && <Icon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />}
        <input
          type={resolvedType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-xl border border-blue-200 py-3 ${Icon ? 'pl-10' : 'pl-4'} ${isPassword ? 'pr-12' : 'pr-4'} text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:text-slate-100 ${readOnly ? 'bg-blue-50 text-slate-600 dark:bg-slate-950 dark:text-slate-300' : 'bg-white dark:bg-slate-900'}`}
          placeholder={placeholder}
          required={required}
          readOnly={readOnly}
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" tabIndex={-1}>
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </span>
      {helper && <span className="mt-2 block text-xs font-medium text-slate-500 dark:text-slate-400">{helper}</span>}
    </label>
  );
}

function SelectField({ label, value, onChange, options, placeholder, required = false, disabled = false, helper }: { label: string; value: string; onChange: (value: string) => void; options: string[]; placeholder: string; required?: boolean; disabled?: boolean; helper?: string }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
        {label} <RequiredMark required={required} />
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-950"
        required={required}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      {helper && <span className="mt-2 block text-xs font-medium text-slate-500 dark:text-slate-400">{helper}</span>}
    </label>
  );
}

function FeatureSections({ feature, onPreview }: { feature: typeof portalFeatures[number]; onPreview: () => void }) {
  const Icon = feature.icon;
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <Panel className="lg:col-span-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="eyebrow">Portal module</p>
            <h2 className="section-title">{feature.label}</h2>
            <p className="section-copy max-w-3xl">{feature.preview}</p>
          </div>
          <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${feature.color} text-white shadow-lg shadow-slate-900/15`}>
            <Icon className="h-8 w-8" />
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ['Coverage', feature.metric],
            ['Status', feature.status],
            ['Users', feature.audience],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white/75 p-4 dark:border-slate-700 dark:bg-slate-900/70">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3">
          {feature.bullets.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/70">
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{item}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="lg:col-span-2">
        <p className="eyebrow">Live preview data</p>
        <div className="mt-5 space-y-4">
          {feature.data.map((item) => (
            <div key={item.name}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{item.name}</span>
                <span className="text-slate-500 dark:text-slate-400">{item.score}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className={`h-full rounded-full bg-gradient-to-r ${feature.color}`} style={{ width: `${Math.max(item.score, 8)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <button onClick={onPreview} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">
          <PlayCircle className="h-4 w-4" />
          Watch full overview
        </button>
      </Panel>
    </div>
  );
}

function OverviewPreviewCarousel({ activeIndex, onSelect, onLogin }: { activeIndex: number; onSelect: (index: number) => void; onLogin: () => void }) {
  const activeFeature = portalFeatures[activeIndex] || portalFeatures[0];
  const Icon = activeFeature.icon;
  const previous = () => onSelect((activeIndex - 1 + portalFeatures.length) % portalFeatures.length);
  const next = () => onSelect((activeIndex + 1) % portalFeatures.length);

  return (
    <div className="grid min-w-0 gap-4 overflow-x-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <Panel className="order-2 lg:order-1">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">System overview preview</p>
            <h2 className="section-title">A guided look at the NSTP workflow.</h2>
            <p className="section-copy">The cards below rotate through the actual portal capabilities. Use the controls or select a card to preview a module directly.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={previous} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">Previous</button>
            <button onClick={next} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Next</button>
          </div>
        </div>

        <div className="mt-6 flex snap-x gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-3">
          {portalFeatures.map((feature, index) => {
            const CardIcon = feature.icon;
            const active = index === activeIndex;
            return (
              <button
                key={feature.label}
                onClick={() => onSelect(index)}
                className={`min-w-[13.5rem] snap-start text-left transition-all md:min-w-0 ${active ? 'scale-[1.02]' : 'opacity-75 hover:opacity-100'}`}
              >
                <span className={`block rounded-2xl border p-4 shadow-sm ${active ? 'border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
                  <span className={`mb-4 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ${feature.color} text-white`}>
                    <CardIcon className="h-6 w-6" />
                  </span>
                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{feature.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">{feature.status}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel id="overview-carousel" className="order-1 min-w-0 scroll-mt-24 overflow-hidden p-4 sm:p-6 lg:order-2">
        <div className={`w-full min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br ${activeFeature.color} p-4 text-white shadow-lg sm:rounded-3xl sm:p-5`}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 sm:text-xs sm:tracking-[0.16em]">Preview {activeIndex + 1} of {portalFeatures.length}</p>
              <h3 className="mt-2 break-words text-2xl font-semibold leading-tight sm:text-3xl">{activeFeature.label}</h3>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/18 sm:h-14 sm:w-14">
              <Icon className="h-5 w-5 sm:h-7 sm:w-7" />
            </span>
          </div>
          <p className="mt-4 max-w-full whitespace-normal text-sm leading-6 text-white/88 [overflow-wrap:anywhere]">{activeFeature.preview}</p>
        </div>

        <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
          {activeFeature.data.map((item) => (
            <div key={item.name} className="min-w-0 rounded-2xl border border-slate-200 bg-white/75 p-4 dark:border-slate-700 dark:bg-slate-900/70">
              <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</span>
                <span className="shrink-0 text-slate-500 dark:text-slate-300">{item.score}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className={`h-full rounded-full bg-gradient-to-r ${activeFeature.color}`} style={{ width: `${Math.max(item.score, 8)}%` }} />
              </div>
            </div>
          ))}
        </div>

        <button onClick={onLogin} className="mt-5 inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-[#ffd24d] px-4 py-3 text-center text-sm font-semibold text-[#061a42] shadow-sm hover:brightness-105 sm:px-5">
          <span className="min-w-0 truncate sm:whitespace-normal">Open portal access</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </Panel>
    </div>
  );
}

function HomeSections({ onStart }: { onStart: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <Panel className="lg:col-span-3">
        <p className="eyebrow">What this system does</p>
        <h2 className="section-title">NSTP delivery, assessment, enrollment, and grading in one BiPSU portal.</h2>
        <p className="section-copy">Students follow the Common Module, complete assessments, receive component classification, and view released grades. Coordinators manage enrollment approvals, modules, exams, reports, and interventions.</p>
      </Panel>
      <Panel className="lg:col-span-3">
        <p className="eyebrow">Academic Workflow</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {['Student ID approval', 'Common Module', 'Post-module tests', 'Grade release'].map((item, index) => (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/75 p-3.5 dark:border-slate-700 dark:bg-slate-900/70 sm:flex-col sm:items-start sm:p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-sm sm:h-auto sm:w-auto sm:bg-transparent sm:p-0 sm:text-2xl sm:font-semibold">
                0{index + 1}
              </span>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className="lg:col-span-6">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">NSTP components at the university</p>
            <h2 className="section-title">Official tracks students can enter after the Common Module.</h2>
          </div>
          <span className="inline-block self-start rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 sm:self-auto sm:text-xs">
            CWTS | Coast Guard | LTS | MTS
          </span>
        </div>

        {/* Mobile Horizontal Snap Carousel / Desktop Multi-Column Grid */}
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3 xl:grid-cols-5 xl:gap-4">
          {componentCards.map((card) => (
            <div key={card.label} className="group min-w-[260px] snap-start overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:-translate-y-1 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:min-w-0">
              <div className={`h-2 bg-gradient-to-r ${card.color}`} />
              <div className="p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">{card.label}</p>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 group-hover:bg-blue-700 group-hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 sm:h-10 sm:w-10 sm:text-sm">{card.value}%</span>
                </div>
                <p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200 sm:text-sm">{card.title}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300 sm:text-sm sm:leading-6">{card.copy}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500 sm:hidden">Swipe horizontally to preview all tracks</p>
      </Panel>
      <Panel className="lg:col-span-3">
        <p className="eyebrow">Live visualization</p>
        <h2 className="section-title">Component distribution is easy to scan.</h2>
        <div className="mt-4 h-60 sm:h-72">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <PieChart>
              <Pie data={componentCards} dataKey="value" nameKey="label" innerRadius={58} outerRadius={88} paddingAngle={4}>
                {componentCards.map((entry) => (
                  <Cell key={entry.label} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Mobile & High-Contrast Legend */}
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-3 dark:border-slate-800">
          {componentCards.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />
              <span className="truncate font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
              <span className="ml-auto font-bold text-slate-900 dark:text-white">{item.value}%</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className="lg:col-span-3">
        <p className="eyebrow">Service outcomes</p>
        <h2 className="section-title">A livelier program view for admins, facilitators, and students.</h2>
        <div className="mt-4 h-60 sm:h-72">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={impactBars} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="score" radius={[8, 8, 0, 0]} fill="#f2b705" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">Standardized readiness & learning outcome metrics</p>
      </Panel>
      <Panel className="lg:col-span-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">Ready to start?</p>
            <h2 className="section-title">Request access with your BiPSU student ID.</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 sm:text-sm">Official registration is open for First Year university students enrolled in NSTP.</p>
          </div>
          <button onClick={onStart} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white shadow-sm hover:bg-blue-800 sm:w-auto">
            Begin registration
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </Panel>
    </div>
  );
}

function NstpSections() {
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <Panel className="lg:col-span-4">
        <p className="eyebrow">Official NSTP program</p>
        <h2 className="section-title">The National Service Training Program develops civic consciousness, service leadership, and community readiness.</h2>
        <p className="section-copy">This official university landing page presents the program components, learning flow, verification process, and digital services used for modules, materials, videos, lessons, quizzes, assignments, major examinations, grades, and reports.</p>
      </Panel>
      <Panel className="lg:col-span-2">
        <p className="eyebrow">Requirement</p>
        <p className="text-6xl font-semibold text-blue-700 dark:text-blue-300">25</p>
        <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">Common Module contact hours tracked by the system.</p>
      </Panel>
      <Panel className="lg:col-span-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['01', 'General orientation'],
            ['02', 'Component enrollment'],
            ['03', 'Assessment and exams'],
            ['04', 'Grades and reports'],
          ].map(([num, label]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900">
              <p className="text-2xl font-semibold text-[#f2b705]">{num}</p>
              <p className="mt-1 text-sm font-bold">{label}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className="lg:col-span-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow">Interactive program map</p>
            <h2 className="section-title">From verified student access to official NSTP completion.</h2>
            <p className="section-copy">The landing page now shows the public-facing story, while the dashboard handles real work after login: approval, modules, assessment, component assignment, progress, grades, announcements, and reports.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Verify', copy: 'Student ID and account approval', tone: 'bg-blue-700' },
              { label: 'Learn', copy: 'Common Module and component content', tone: 'bg-emerald-600' },
              { label: 'Assess', copy: 'Post-module quizzes and major exams', tone: 'bg-amber-500' },
              { label: 'Release', copy: 'Grades, clearance, and reports', tone: 'bg-indigo-600' },
            ].map((item) => (
              <div key={item.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <span className={`absolute right-4 top-4 h-3 w-3 rounded-full ${item.tone}`} />
                <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-300">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function SchoolSections() {
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <Panel className="lg:col-span-3">
        <p className="eyebrow">About BiPSU</p>
        <h2 className="section-title">Biliran Province State University serves as a center for learning, innovation, public service, and community development in Biliran.</h2>
        <p className="section-copy">The portal reflects BiPSU's official blue and gold identity and its service area in Naval, Biliran, while supporting student development and academic governance.</p>
      </Panel>
      <Panel className="lg:col-span-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { icon: MapPinned, title: 'Biliran service area', copy: 'Localized for BiPSU NSTP operations.' },
            { icon: Landmark, title: 'Academic governance', copy: 'Approval, reporting, and released grades.' },
            { icon: Users, title: 'Student development', copy: 'Civic service and component classification.' },
            { icon: Sparkles, title: 'Blue and gold', copy: 'A visual system aligned with the university seal.' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-white/75 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                <Icon className="mb-3 h-5 w-5 text-blue-700 dark:text-blue-300" />
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{item.copy}</p>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function PortalSections({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <Panel className="lg:col-span-2">
        <ShieldCheck className="mb-4 h-7 w-7 text-blue-700 dark:text-blue-300" />
        <p className="text-xl font-semibold">Verified onboarding</p>
        <p className="section-copy">Student accounts require approval before access, using a BiPSU student ID as the key identifier.</p>
      </Panel>
      <Panel className="lg:col-span-2">
        <TrendingUp className="mb-4 h-7 w-7 text-emerald-600" />
        <p className="text-xl font-semibold">Live analytics</p>
        <p className="section-copy">Admins see progress bands, component distribution, intervention signals, and export-ready reports.</p>
      </Panel>
      <Panel className="lg:col-span-2">
        <FileText className="mb-4 h-7 w-7 text-amber-600" />
        <p className="text-xl font-semibold">Grade center</p>
        <p className="section-copy">Students can view released First and Second Semester standing and clearance requirements.</p>
      </Panel>
      <Panel className="lg:col-span-6">
        <button onClick={onLogin} className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#f2b705] px-6 py-3 font-semibold text-[#09285f] shadow-sm hover:bg-[#ffe17d]">
          Open portal access
          <ArrowRight className="h-4 w-4" />
        </button>
      </Panel>
    </div>
  );
}

function Panel({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-2xl border border-slate-200 bg-white/82 p-4 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78 sm:p-6 lg:p-8 ${className}`}>
      {children}
    </section>
  );
}
