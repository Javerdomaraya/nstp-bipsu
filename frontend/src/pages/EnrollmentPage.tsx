import { useState } from 'react';
import { Shield, Heart, Anchor, CheckCircle, LogOut, Sparkles } from 'lucide-react';
import RoleShell from '../components/layout/RoleShell';
import type { NstpComponent } from '../data/nstpData';
import type { StudentUser } from '../services/authUser';

// `as const` is what keeps `name` a literal type rather than a widened `string`,
// so the compiler — not a runtime check downstream — proves that every option on
// this screen is one of the five canonical `NstpComponent` labels. A typo here is
// a build error instead of a component preference nothing else recognises.
const NSTP_COMPONENTS = [
  {
    id: 'cwts',
    name: 'CWTS',
    fullName: 'Civic Welfare Training Service',
    description: 'Activities contributory to the general welfare and betterment of life for the members of the community.',
    icon: Heart,
    color: 'bg-green-600',
    benefits: [
      'Community development projects',
      'Health and education programs',
      'Environmental initiatives',
      'Social welfare activities'
    ]
  },
  {
    id: 'cwts-coast-guard',
    name: 'CWTS (Coast Guard)',
    fullName: 'Civic Welfare Training Service - Coast Guard',
    description: 'Coastal defense, maritime safety, search and rescue, and community service along Philippine waters.',
    icon: Anchor,
    color: 'bg-cyan-600',
    benefits: [
      'Maritime safety and security',
      'Search and rescue operations',
      'Coastal community service',
      'Disaster response and preparedness'
    ]
  },
  {
    id: 'lts',
    name: 'LTS',
    fullName: 'Literacy Training Service',
    description: 'Programs designed to train students to become teachers of literacy and numeracy skills.',
    icon: Shield,
    color: 'bg-blue-600',
    benefits: [
      'Teaching literacy to communities',
      'Educational outreach programs',
      'Tutorial and mentorship activities',
      'Learning material development'
    ]
  },
  {
    id: 'mts-army',
    name: 'MTS (Army)',
    fullName: 'Military Training Service - Army',
    description: 'Military training program to motivate, train, organize and mobilize students for national defense.',
    icon: Shield,
    color: 'bg-orange-600',
    benefits: [
      'Military discipline and training',
      'Leadership development',
      'Physical fitness programs',
      'National defense preparation'
    ]
  },
  {
    id: 'mts-navy',
    name: 'MTS (Navy)',
    fullName: 'Military Training Service - Navy',
    description: 'Naval training program focused on maritime defense and coastal community service.',
    icon: Anchor,
    color: 'bg-indigo-600',
    benefits: [
      'Naval operations training',
      'Maritime safety and security',
      'Coastal community service',
      'Leadership at sea'
    ]
  }
] as const;

type ComponentOption = (typeof NSTP_COMPONENTS)[number];

export default function EnrollmentPage({ user, onEnroll, onLogout }: { user: StudentUser; onEnroll: (component: NstpComponent) => void; onLogout: () => void }) {
  // Show completion message
  const hasCompletedGeneralEd = user.generalEducationComplete;
  const [selectedComponent, setSelectedComponent] = useState<ComponentOption | null>(null);

  const handleEnroll = () => {
    if (selectedComponent) {
      onEnroll(selectedComponent.name);
    }
  };

  return (
    <RoleShell
      user={user}
      onLogout={onLogout}
      eyebrow="Student Workspace"
      title="Select Your NSTP Component"
      description="Choose the National Service Training Program component that aligns with your interests and career goals."
      sidebarTitle="Enrollment Status"
      sidebarItems={[
        { label: 'General Education', value: hasCompletedGeneralEd ? 'Completed' : 'In progress', tone: 'success' },
        { label: 'Selected Component', value: selectedComponent ? selectedComponent.name : 'Not selected yet', tone: 'warning' },
        { label: 'Next Step', value: 'Complete component enrollment', tone: 'info' },
      ]}
    >
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-slate-800">
            <p className="text-xs uppercase tracking-[0.16em] font-semibold text-amber-700 mb-2">Enrollment Stage</p>
            <h3 className="text-lg font-bold text-slate-900 mb-1 dark:text-slate-100">Choose your NSTP component</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">Your selected component determines your specialized modules, activities, and deployment context.</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-slate-800">
            <p className="text-xs uppercase tracking-[0.16em] font-semibold text-emerald-700 mb-2">Readiness</p>
            <h3 className="text-lg font-bold text-slate-900 mb-1 dark:text-slate-100">General Education completed</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">You can now officially enroll in CWTS, LTS, or MTS tracks.</p>
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          {hasCompletedGeneralEd && (
            <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-xl mb-4 dark:bg-green-500/15 dark:text-green-100">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">General Education Complete - 25 Hours</span>
            </div>
          )}
          <h1 className="text-3xl font-bold text-slate-900 mb-3 dark:text-slate-100">Select Your NSTP Component</h1>
          <p className="text-slate-600 max-w-2xl mx-auto dark:text-slate-300">
            Choose the National Service Training Program component that aligns with your interests and career goals.
            Each component includes specialized training and community service.
          </p>
        </div>

        {/* Component Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {NSTP_COMPONENTS.map((component) => {
            const Icon = component.icon;
            const isSelected = selectedComponent?.id === component.id;

            return (
              <button
                key={component.id}
                onClick={() => setSelectedComponent(component)}
                className={`text-left p-6 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50 shadow-lg dark:border-amber-400 dark:bg-amber-500/10'
                    : 'border-slate-200 bg-white hover:border-amber-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-amber-400'
                }`}
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className={`${component.color} p-3 rounded-lg`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100">{component.name}</h3>
                      {isSelected && <CheckCircle className="w-5 h-5 text-amber-600" />}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{component.fullName}</p>
                  </div>
                </div>

                <p className="text-sm text-slate-700 mb-4 dark:text-slate-300">{component.description}</p>

                <div className="space-y-2">
                  {component.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                      {benefit}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Enroll Button */}
        {selectedComponent && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 mb-1 dark:text-slate-100">
                  Ready to enroll in {selectedComponent.name}?
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  You'll get access to all modules, assessments, and learning materials.
                </p>
              </div>
              <button
                onClick={handleEnroll}
                className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-3 rounded-xl hover:opacity-95 transition-opacity font-medium inline-flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Complete Enrollment
              </button>
            </div>
          </div>
        )}
      </div>
    </RoleShell>
  );
}
