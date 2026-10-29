import { useState, useRef, useEffect } from 'react';
import { searchBarangays, type Barangay } from '../../../services/api';
import { getBuiltInBarangays } from '../../../data/addressData';

interface BarangaySearchProps {
  municipalityCode: string;
  municipalityName?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export default function BarangaySearch({
  municipalityCode,
  municipalityName,
  value,
  onChange,
  required,
  disabled,
}: BarangaySearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const lookupKey = municipalityCode || municipalityName || '';
  const initialBuiltIn = lookupKey ? getBuiltInBarangays(lookupKey) : [];
  const [allBarangays, setAllBarangays] = useState<Barangay[]>(initialBuiltIn);
  const [filtered, setFiltered] = useState<Barangay[]>(initialBuiltIn);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const key = municipalityCode || municipalityName;
    if (!key) {
      setAllBarangays([]);
      setFiltered([]);
      return;
    }

    // Instantly load canonical built-in barangays (Zero Lockout)
    const builtIn = getBuiltInBarangays(key);
    if (builtIn.length > 0) {
      setAllBarangays(builtIn);
      setFiltered(builtIn);
    }

    if (municipalityCode) {
      setLoading(true);
      searchBarangays(municipalityCode, '')
        .then((res) => {
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            setAllBarangays(res.data);
            setFiltered(res.data);
          }
        })
        .catch(() => {
          // Gracefully keep builtIn barangays
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [municipalityCode, municipalityName]);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(allBarangays);
      return;
    }
    const q = query.toLowerCase();
    setFiltered(allBarangays.filter((b) => b.name.toLowerCase().includes(q)));
  }, [query, allBarangays]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (barangay: Barangay) => {
    onChange(barangay.name);
    setQuery(barangay.name);
    setOpen(false);
  };

  const isInputDisabled = Boolean(disabled || (!municipalityCode && !municipalityName));

  return (
    <div ref={ref} className="relative">
      <label className="block">
        <span className="mb-2 flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
          Barangay {required && <span className="text-rose-600 dark:text-rose-300">*</span>}
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange('');
          }}
          onFocus={() => {
            if (municipalityCode || municipalityName) setOpen(true);
          }}
          placeholder={isInputDisabled ? 'Select a municipality first' : 'Search or select barangay...'}
          required={required}
          disabled={isInputDisabled}
          className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-950"
        />
      </label>
      {open && (municipalityCode || municipalityName) && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-blue-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {loading && allBarangays.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500">Loading barangays...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500">No barangay found.</div>
          )}
          {filtered.map((b) => (
            <button
              key={b.code}
              type="button"
              onMouseDown={() => handleSelect(b)}
              className="w-full px-4 py-2 text-left text-sm font-medium text-slate-700 hover:bg-blue-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
