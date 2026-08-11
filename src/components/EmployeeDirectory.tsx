import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Edit2, UserPlus, Save, X, RefreshCw, AlertCircle, Upload, Check, FileSpreadsheet, Settings, Search, AlertTriangle, Users as UsersIcon, Clock } from 'lucide-react';
import { Employee, SheetPreviewData, Project } from '../types';
import { getEmployees, saveEmployee, deleteEmployee, cleanupOrphanedEmployees, getSupabase } from '../lib/db';
import { parseExcelFile } from '../utils/excel';
import TableSkeleton from './skeletons/TableSkeleton';

interface EmployeeDirectoryProps {
  theme: 'dark' | 'light';
  refreshTrigger?: number;
  onDirectoryChanged?: () => void;
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
}

export default function EmployeeDirectory({ theme, refreshTrigger = 0, onDirectoryChanged, currentUser }: EmployeeDirectoryProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Project Assignment state
  const [searchTerm, setSearchTerm] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectLinks, setProjectLinks] = useState<{ employee_id: string; project_id: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formEmpId, setFormEmpId] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesignation, setFormDesignation] = useState('Developer');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<'Admin' | 'Project Manager' | 'Lead' | 'Employee'>('Employee');

  // Password Display Modal for manual creation
  const [createdPasswordModal, setCreatedPasswordModal] = useState<{ name: string; email: string; password?: string; linkedOnly?: boolean } | null>(null);

  // Cleanup states
  const [cleaning, setCleaning] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState<string | null>(null);

  // Toggle state between 'none' | 'manual' | 'bulk'
  const [activeForm, setActiveForm] = useState<'none' | 'manual' | 'bulk'>('none');

  // Custom Confirm Modal State
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Bulk Excel import states
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelSheets, setExcelSheets] = useState<SheetPreviewData[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState('');
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<any[]>([]);
  const [mappingConfig, setMappingConfig] = useState({
    empIdCol: '',
    nameCol: '',
    designationCol: '',
    emailCol: ''
  });
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    created: number;
    skipped: number;
    failed: number;
    errors: string[];
    passwords?: { name: string; email: string; password?: string; linkedOnly?: boolean }[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getEmployees();
      setEmployees(data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load employee directory.');
    } finally {
      setLoading(false);
    }
  };

  const loadProjectsAndLinks = async () => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      let pQuery = sb.from('projects').select('*');
      if (currentUser?.role === 'Project Manager' && currentUser.id) {
        pQuery = pQuery.eq('owner_id', currentUser.id);
      }
      const { data: pData } = await pQuery.order('name');
      setProjects(pData || []);

      const { data: lData } = await sb.from('employee_project_links').select('employee_id, project_id');
      setProjectLinks(lData || []);
    } catch (err) {
      console.error("Failed to load projects/links in EmployeeDirectory:", err);
    }
  };

  const loadData = async () => {
    await Promise.all([loadEmployees(), loadProjectsAndLinks()]);
  };

  useEffect(() => {
    loadData();
  }, [refreshTrigger, currentUser]);

  const handleBulkAssign = async () => {
    if (!selectedProjectId || selectedEmployeeIds.length === 0) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      setLoading(true);
      setError(null);
      
      const inserts = selectedEmployeeIds.map(empId => ({
        project_id: selectedProjectId,
        employee_id: empId
      }));

      const { error: insertErr } = await sb.from('employee_project_links').upsert(inserts, { onConflict: 'employee_id,project_id' });
      if (insertErr) throw insertErr;

      setSelectedEmployeeIds([]);
      await loadProjectsAndLinks();
      if (onDirectoryChanged) onDirectoryChanged();
    } catch (err: any) {
      console.error(err);
      setError("Failed to link resources: " + (err.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRevoke = async () => {
    if (!selectedProjectId || selectedEmployeeIds.length === 0) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      setLoading(true);
      setError(null);

      const { error: deleteErr } = await sb.from('employee_project_links')
        .delete()
        .eq('project_id', selectedProjectId)
        .in('employee_id', selectedEmployeeIds);
      if (deleteErr) throw deleteErr;

      setSelectedEmployeeIds([]);
      await loadProjectsAndLinks();
      if (onDirectoryChanged) onDirectoryChanged();
    } catch (err: any) {
      console.error(err);
      setError("Failed to revoke resources: " + (err.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = React.useMemo(() => {
    return employees.filter(emp => {
      const searchLower = searchTerm.toLowerCase();
      return (
        emp.name.toLowerCase().includes(searchLower) ||
        emp.employeeId.toLowerCase().includes(searchLower) ||
        emp.designation.toLowerCase().includes(searchLower) ||
        (emp.role || 'Employee').toLowerCase().includes(searchLower)
      );
    });
  }, [employees, searchTerm]);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmpId.trim() || !formName.trim()) {
      setError('Please provide both an Employee ID and Name.');
      return;
    }

    try {
      setError(null);
      const res = await saveEmployee({
        employeeId: formEmpId.trim(),
        name: formName.trim(),
        designation: formDesignation,
        email: formEmail.trim() || undefined,
        role: formRole
      }, currentUser?.id);
      
      // Save password and details to show in modal
      setCreatedPasswordModal({
        name: formName.trim(),
        email: res.email || `${formEmpId.trim().toLowerCase()}@mediantlabs.com`,
        password: res.password,
        linkedOnly: res.linkedOnly
      });

      // Reset form
      setFormEmpId('');
      setFormName('');
      setFormDesignation('Developer');
      setFormEmail('');
      setFormRole('Employee');
      setActiveForm('none');
      
      await loadEmployees();
      if (onDirectoryChanged) onDirectoryChanged();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to register employee.');
    }
  };

  const handleExcelChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        setError(null);
        setImportSummary(null);
        const sheetsData = await parseExcelFile(file);
        if (sheetsData.length === 0 || sheetsData[0].rows.length === 0) {
          throw new Error('This spreadsheet has no valid rows or tabs.');
        }
        setExcelFile(file);
        setExcelSheets(sheetsData);
        setSelectedSheetName(sheetsData[0].sheetName);
        setExcelHeaders(sheetsData[0].headers);
        setExcelRows(sheetsData[0].rows);

        // Auto-detect standard columns
        const headers = sheetsData[0].headers;
        const idCol = headers.find(h => /emp/i.test(h) || /id/i.test(h)) || '';
        const nameCol = headers.find(h => /name/i.test(h)) || '';
        const desigCol = headers.find(h => /desig/i.test(h) || /role/i.test(h) || /pos/i.test(h) || /title/i.test(h)) || '';
        const emailCol = headers.find(h => /email/i.test(h) || /mail/i.test(h)) || '';

        setMappingConfig({
          empIdCol: idCol,
          nameCol,
          designationCol: desigCol,
          emailCol
        });
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to parse Excel file.');
      }
    }
  };

  const handleSheetChange = (sheetName: string) => {
    const sheet = excelSheets.find(s => s.sheetName === sheetName);
    if (sheet) {
      setSelectedSheetName(sheetName);
      setExcelHeaders(sheet.headers);
      setExcelRows(sheet.rows);

      // Re-run auto-detection for the new sheet
      const headers = sheet.headers;
      const idCol = headers.find(h => /emp/i.test(h) || /id/i.test(h)) || '';
      const nameCol = headers.find(h => /name/i.test(h)) || '';
      const desigCol = headers.find(h => /desig/i.test(h) || /role/i.test(h) || /pos/i.test(h) || /title/i.test(h)) || '';
      const emailCol = headers.find(h => /email/i.test(h) || /mail/i.test(h)) || '';

      setMappingConfig({
        empIdCol: idCol,
        nameCol,
        designationCol: desigCol,
        emailCol
      });
    }
  };

  const handleStartImport = async () => {
    if (!mappingConfig.empIdCol || !mappingConfig.nameCol) {
      setError('Please map at least Employee ID and Name columns.');
      return;
    }

    setImporting(true);
    setError(null);
    setImportSummary(null);

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];
    const passwords: { name: string; email: string; password?: string; linkedOnly?: boolean }[] = [];

    for (const row of excelRows) {
      const rawEmpId = String(row[mappingConfig.empIdCol] || '').trim();
      const rawName = String(row[mappingConfig.nameCol] || '').trim();
      
      // If either id or name is blank, we skip it
      if (!rawEmpId || !rawName) {
        skipped++;
        continue;
      }

      // Read designation (optional, fallback to 'Developer')
      const rawDesig = mappingConfig.designationCol 
        ? String(row[mappingConfig.designationCol] || '').trim() || 'Developer'
        : 'Developer';

      // Read custom email (optional)
      let customEmail = '';
      if (mappingConfig.emailCol) {
        customEmail = String(row[mappingConfig.emailCol] || '').trim().toLowerCase();
      }
      
      const email = customEmail || `${rawEmpId.toLowerCase()}@mediantlabs.com`;

      try {
        const res = await saveEmployee({
          employeeId: rawEmpId,
          name: rawName,
          designation: rawDesig,
          email: email
        }, currentUser?.id);
        
        if (res.linkedOnly) {
          skipped++;
          passwords.push({
            name: rawName,
            email: email,
            linkedOnly: true
          });
        } else {
          created++;
          if (res.password) {
            passwords.push({
              name: rawName,
              email: email,
              password: res.password
            });
          }
        }
      } catch (err: any) {
        console.error(`Import failed for ${rawName}:`, err);
        failed++;
        errors.push(`${rawName} (${rawEmpId}): ${err.message || 'Signup failed'}`);
      }
    }

    setImportSummary({ created, skipped, failed, errors, passwords });
    setImporting(false);
    await loadEmployees();
    if (onDirectoryChanged) onDirectoryChanged();
  };

  const handleCancelBulk = () => {
    setExcelFile(null);
    setExcelSheets([]);
    setSelectedSheetName('');
    setExcelHeaders([]);
    setExcelRows([]);
    setMappingConfig({
      empIdCol: '',
      nameCol: '',
      designationCol: '',
      emailCol: ''
    });
    setImportSummary(null);
    setActiveForm('none');
    setError(null);
  };

  const handleStartEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setFormEmpId(emp.employeeId);
    setFormName(emp.name);
    setFormDesignation(emp.designation);
    setFormRole(emp.role || 'Employee');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormEmpId('');
    setFormName('');
    setFormDesignation('Developer');
    setFormRole('Employee');
  };

  const handleSaveEdit = async (id: string) => {
    if (!formEmpId.trim() || !formName.trim()) {
      setError('Please provide both Employee ID and Name.');
      return;
    }

    // Check for duplicate ID excluding current edited employee
    if (employees.some(emp => emp.id !== id && emp.employeeId.trim().toLowerCase() === formEmpId.trim().toLowerCase())) {
      setError(`Employee ID "${formEmpId}" is already registered.`);
      return;
    }

    try {
      setError(null);
      await saveEmployee({
        id,
        employeeId: formEmpId.trim(),
        name: formName.trim(),
        designation: formDesignation,
        role: formRole
      });
      setEditingId(null);
      setFormRole('Employee');
      await loadEmployees();
      if (onDirectoryChanged) onDirectoryChanged();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update employee.');
    }
  };

  const handleDelete = (id: string) => {
    setConfirmModal({
      message: 'Are you sure you want to remove this employee? This will unassign them from any phases.',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          setError(null);
          await deleteEmployee(id);
          await loadEmployees();
          if (onDirectoryChanged) onDirectoryChanged();
        } catch (err: any) {
          console.error(err);
          setError(err.message || 'Failed to delete employee.');
        }
      }
    });
  };

  const handleCleanupOrphaned = () => {
    setConfirmModal({
      message: 'Are you sure you want to clean up legacy/broken employee auth accounts? This will remove accounts with missing providers (like legacy Vine or Peter entries) from both Supabase Auth and employees table, allowing you to recreate them cleanly.',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          setCleaning(true);
          setCleanupStatus(null);
          setError(null);
          const res = await cleanupOrphanedEmployees();
          setCleanupStatus(`Cleanup complete! Removed ${res.deletedAuthCount} Auth user(s) and ${res.deletedDbCount} database profile(s).`);
          await loadEmployees();
          if (onDirectoryChanged) onDirectoryChanged();
        } catch (err: any) {
          console.error(err);
          setError(err.message || "Failed to perform directory cleanup.");
        } finally {
          setCleaning(false);
        }
      }
    });
  };

  return (
    <div id="employee-directory-page" className="-mt-6 space-y-6 animate-fade-up bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-150">
      {/* ── Top Header Bar (Matching Overview Page Header) ── */}
      <div className="h-[52px] flex items-center justify-between border-b border-[var(--border-subtle)] px-0 gap-4">
        {/* Left Section: Title + Inline Search + Target Project Selector */}
        <div className="flex items-center gap-4 flex-wrap flex-1 min-w-0">
          <h1 className={`text-2xl font-black tracking-tight shrink-0 ${theme === 'light' ? 'bg-gradient-to-r from-[#1DAA58] to-[#2484C6] bg-clip-text text-transparent' : 'text-white'}`}>Directory &amp; Credentials</h1>

          {/* Compact Inline Search Bar (Matching Projects Page) */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, ID code..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58] transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Inline Target Project Selector (Admin, PM, Lead) */}
          {(currentUser?.role === 'Admin' || currentUser?.role === 'Project Manager' || currentUser?.role === 'Lead') && (
            <div className="flex items-center gap-2 shrink-0">
              <select
                aria-label="Manage target project resource links"
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden cursor-pointer"
              >
                <option value="">-- Target Project --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {selectedProjectId && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleBulkAssign}
                    disabled={selectedEmployeeIds.length === 0}
                    className="px-2.5 py-1.5 bg-[#1DAA58] hover:brightness-110 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all active:scale-97 cursor-pointer"
                  >
                    Link ({selectedEmployeeIds.length})
                  </button>
                  <button
                    onClick={handleBulkRevoke}
                    disabled={selectedEmployeeIds.length === 0}
                    className="px-2.5 py-1.5 bg-rose-500 hover:brightness-110 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all active:scale-97 cursor-pointer"
                  >
                    Revoke ({selectedEmployeeIds.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Section: Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {activeForm === 'none' && (
            <>
              {currentUser?.role === 'Admin' && (
                <>
                  <button
                    onClick={handleCleanupOrphaned}
                    disabled={cleaning}
                    className="px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Cleanup orphaned legacy auth entries"
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    <span>{cleaning ? 'Cleaning...' : 'Cleanup Legacy'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveForm('bulk');
                      setError(null);
                      setImportSummary(null);
                    }}
                    className="px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#2484C6]" />
                    <span>Upload Employee List</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveForm('manual');
                      setError(null);
                    }}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-[#1DAA58] to-[#2484C6] text-white font-medium text-xs rounded-lg shadow-md hover:opacity-90 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Register Employee</span>
                  </button>
                </>
              )}
            </>
          )}

          <button
            onClick={loadEmployees}
            className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Reload directory list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {cleanupStatus && (
        <div className="p-4 mx-5 mt-4 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-450 flex items-start gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{cleanupStatus}</span>
          </div>
          <button onClick={() => setCleanupStatus(null)} className="text-neutral-400 hover:text-white text-[10px] ml-2">✕</button>
        </div>
      )}

      {error && (
        <div className="p-4 mx-5 mt-4 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Register Form */}
      {activeForm === 'manual' && (
        <form onSubmit={handleAddEmployee} className="p-5 border-b border-neutral-500/5 bg-neutral-500/5 space-y-4">
          <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wide flex items-center justify-between">
            <span>New Employee Registration</span>
            <button
              type="button"
              onClick={() => setActiveForm('none')}
              className="text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <div>
              <label className="block text-[10px] font-medium text-neutral-400 uppercase mb-1">Employee ID</label>
              <input
                type="text"
                required
                placeholder="e.g. EMP004"
                value={formEmpId}
                onChange={e => setFormEmpId(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                  theme === 'dark' ? 'bg-neutral-800 text-white border-neutral-750' : 'bg-white text-neutral-900 border-neutral-300'
                }`}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-neutral-400 uppercase mb-1">Employee Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Connor Kenway"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                  theme === 'dark' ? 'bg-neutral-800 text-white border-neutral-750' : 'bg-white text-neutral-900 border-neutral-300'
                }`}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-neutral-400 uppercase mb-1">Designation</label>
              <select
                value={formDesignation}
                onChange={e => setFormDesignation(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                  theme === 'dark' ? 'bg-neutral-800 text-white border-neutral-750' : 'bg-white text-neutral-900 border-neutral-300'
                }`}
              >
                <option value="Storyboard">Storyboard</option>
                <option value="Developer">Developer</option>
                <option value="QA">QA</option>
                <option value="Project Manager">Project Manager</option>
                <option value="Designer">Designer</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-neutral-400 uppercase mb-1">Email (Optional)</label>
              <input
                type="email"
                placeholder="e.g. connor@mediantlabs.com"
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                  theme === 'dark' ? 'bg-neutral-800 text-white border-neutral-750' : 'bg-white text-neutral-900 border-neutral-300'
                }`}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-neutral-400 uppercase mb-1">System Role</label>
              <select
                value={formRole}
                onChange={e => setFormRole(e.target.value as any)}
                className={`w-full px-3 py-2 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                  theme === 'dark' ? 'bg-neutral-800 text-white border-neutral-750' : 'bg-white text-neutral-900 border-neutral-300'
                }`}
              >
                <option value="Employee">Employee</option>
                <option value="Lead">Lead</option>
                <option value="Project Manager">Project Manager</option>
                {currentUser?.role === 'Admin' && <option value="Admin">Admin</option>}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setActiveForm('none');
                setError(null);
              }}
              className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                theme === 'dark'
                  ? 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                  : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#1DAA58] hover:brightness-110 active:scale-97 text-white text-xs font-bold rounded-md transition-all shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Staff</span>
            </button>
          </div>
        </form>
      )}

      {/* Bulk Excel Import Form */}
      {activeForm === 'bulk' && (
        <div className="p-5 border-b border-neutral-500/5 bg-neutral-500/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-[#2484C6]" />
              <span>Bulk Employee Upload (Excel)</span>
            </h3>
            <button
              onClick={handleCancelBulk}
              className="p-1 hover:bg-neutral-500/10 rounded text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!excelFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer group border-2 border-dashed border-[#B1B7C3]/20 hover:border-[#2484C6] hover:bg-[#2484C6]/2 p-8 rounded-lg flex flex-col items-center justify-center text-center transition-all"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={handleExcelChange}
              />
              <div className="p-3 rounded-full bg-neutral-500/10 text-neutral-400 group-hover:text-[#2484C6] group-hover:bg-[#2484C6]/10 transition-all mb-2">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-neutral-300">
                Drag & drop or <span className="text-[#2484C6]">click to browse</span>
              </p>
              <p className="text-[10px] text-neutral-500 mt-1">Accepts spreadsheet files ending in .xlsx or .xlsm</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected file info */}
              <div className="p-3 rounded-md bg-neutral-500/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="w-5 h-5 text-[#1DAA58]" />
                  <div className="truncate">
                    <p className="text-xs font-semibold text-neutral-200 truncate">{excelFile.name}</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">{excelRows.length} potential rows loaded</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setExcelFile(null);
                    setExcelSheets([]);
                    setExcelHeaders([]);
                    setExcelRows([]);
                    setImportSummary(null);
                  }}
                  className="p-1 px-2 text-[10px] border border-neutral-700 text-neutral-400 hover:bg-neutral-800 rounded transition-all"
                >
                  Change File
                </button>
              </div>

              {/* Sheet selector if multiple */}
              {excelSheets.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-neutral-400">Sheet Tab:</span>
                  <select
                    value={selectedSheetName}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className={`text-xs py-1 px-2 rounded-md border ${
                      theme === 'dark' ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  >
                    {excelSheets.map(s => (
                      <option key={s.sheetName} value={s.sheetName}>{s.sheetName}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Column mapping interface */}
              <div className={`p-4 rounded-md border space-y-3 ${
                theme === 'dark' ? 'bg-neutral-900/40 border-[#B1B7C3]/10' : 'bg-neutral-50 border-neutral-200'
              }`}>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-300 uppercase tracking-wide">
                  <Settings className="w-3.5 h-3.5 text-[#2484C6]" />
                  <span>Map Spreadsheet Columns</span>
                </div>
                <p className="text-[10px] text-neutral-450">We auto-detected columns, please double check mapping is correct before starting import:</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-neutral-400 mb-1">Employee ID Column *</label>
                    <select
                      value={mappingConfig.empIdCol}
                      onChange={(e) => setMappingConfig(prev => ({ ...prev, empIdCol: e.target.value }))}
                      className={`w-full p-1.5 text-xs rounded border focus:outline-hidden ${
                        theme === 'dark' ? 'bg-neutral-850 text-white border-neutral-700' : 'bg-white text-neutral-900 border-neutral-300'
                      }`}
                    >
                      <option value="">-- Select Column --</option>
                      {excelHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-neutral-400 mb-1">Full Name Column *</label>
                    <select
                      value={mappingConfig.nameCol}
                      onChange={(e) => setMappingConfig(prev => ({ ...prev, nameCol: e.target.value }))}
                      className={`w-full p-1.5 text-xs rounded border focus:outline-hidden ${
                        theme === 'dark' ? 'bg-neutral-850 text-white border-neutral-700' : 'bg-white text-neutral-900 border-neutral-300'
                      }`}
                    >
                      <option value="">-- Select Column --</option>
                      {excelHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-neutral-400 mb-1">Designation Column (Optional)</label>
                    <select
                      value={mappingConfig.designationCol}
                      onChange={(e) => setMappingConfig(prev => ({ ...prev, designationCol: e.target.value }))}
                      className={`w-full p-1.5 text-xs rounded border focus:outline-hidden ${
                        theme === 'dark' ? 'bg-neutral-850 text-white border-neutral-700' : 'bg-white text-neutral-900 border-neutral-300'
                      }`}
                    >
                      <option value="">-- Default to Developer --</option>
                      {excelHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-neutral-400 mb-1">Email Column (Optional)</label>
                    <select
                      value={mappingConfig.emailCol}
                      onChange={(e) => setMappingConfig(prev => ({ ...prev, emailCol: e.target.value }))}
                      className={`w-full p-1.5 text-xs rounded border focus:outline-hidden ${
                        theme === 'dark' ? 'bg-neutral-850 text-white border-neutral-700' : 'bg-white text-neutral-900 border-neutral-300'
                      }`}
                    >
                      <option value="">-- Auto-generate from ID --</option>
                      {excelHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-neutral-500/5">
                  <button
                    type="button"
                    onClick={handleCancelBulk}
                    className={`px-3 py-1.5 text-xs rounded border ${
                      theme === 'dark' ? 'border-neutral-700 text-neutral-400 hover:bg-neutral-850' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={importing || !mappingConfig.empIdCol || !mappingConfig.nameCol}
                    onClick={handleStartImport}
                    className="px-4 py-1.5 bg-[#2484C6] hover:brightness-110 active:scale-97 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    {importing ? (
                      <>
                        <span className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Registering Users...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Start Bulk Import</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Import summary rendering */}
          {importSummary && (
            <div className={`p-4 rounded-md border text-xs space-y-3 ${
              theme === 'dark' ? 'bg-[#121417]/60 border-[#B1B7C3]/10' : 'bg-neutral-50 border-neutral-200'
            }`}>
              <h4 className="font-bold text-neutral-200 uppercase tracking-wide">Import Finished Summary</h4>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/15 rounded-md">
                  <span className="block text-xl font-bold text-emerald-400">{importSummary.created}</span>
                  <span className="text-[10px] text-neutral-400 font-medium">Created Successfully</span>
                </div>
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/15 rounded-md">
                  <span className="block text-xl font-bold text-amber-400">{importSummary.skipped}</span>
                  <span className="text-[10px] text-neutral-400 font-medium">Skipped (Duplicate)</span>
                </div>
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/15 rounded-md">
                  <span className="block text-xl font-bold text-rose-400">{importSummary.failed}</span>
                  <span className="text-[10px] text-neutral-400 font-medium">Failed</span>
                </div>
              </div>

              {importSummary.errors.length > 0 && (
                <div className="space-y-1 max-h-36 overflow-y-auto pt-2 border-t border-neutral-500/10">
                  <span className="font-bold text-rose-450 block">Failure Details:</span>
                  {importSummary.errors.map((err, idx) => (
                    <p key={idx} className="text-[10.5px] text-rose-400 font-mono">
                      • {err}
                    </p>
                  ))}
                </div>
              )}

              {importSummary.passwords && importSummary.passwords.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto pt-3 border-t border-neutral-500/10">
                  <span className="font-bold text-emerald-450 block">Generated Credentials:</span>
                  <p className="text-[10px] text-amber-500 mb-2">Please share these temporary passwords with the employees. They will only be shown once.</p>
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead>
                      <tr className="text-neutral-450 border-b border-neutral-500/5">
                        <th className="py-1">Name</th>
                        <th className="py-1">Email</th>
                        <th className="py-1">Temp Password</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importSummary.passwords.map((pw, idx) => (
                        <tr key={idx} className="border-b border-neutral-500/5 hover:bg-neutral-800/30">
                          <td className="py-1 pr-2 truncate max-w-[120px] text-neutral-300">{pw.name}</td>
                          <td className="py-1 pr-2 truncate max-w-[160px] text-neutral-400">{pw.email}</td>
                          <td className="py-1 font-bold text-emerald-400 select-all">{pw.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Directory Table in exact Dual-Theme Variable Styling */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl overflow-hidden">
        {!loading && employees.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)] border border-dashed rounded-xl border-[var(--border-subtle)] m-6">
            <UserPlus className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
            <p className="text-xs font-semibold text-[var(--text-muted)]">No employees registered. Click Register Employee to populate directory.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[var(--input-bg)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider font-semibold text-[10px]">
                  {/* Bulk checkbox header */}
                  {(currentUser?.role === 'Admin' || currentUser?.role === 'Project Manager' || currentUser?.role === 'Lead') && (
                    <th className="p-4 w-8">
                      <input
                        aria-label="Select all employees"
                        type="checkbox"
                        checked={filteredEmployees.length > 0 && selectedEmployeeIds.length === filteredEmployees.filter(e => e.role === 'Employee' || e.role === 'Lead').length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEmployeeIds(filteredEmployees.filter(e => e.role === 'Employee' || e.role === 'Lead').map(emp => emp.id));
                          } else {
                            setSelectedEmployeeIds([]);
                          }
                        }}
                        className="rounded border-[var(--border-subtle)] bg-[var(--input-bg)] focus:ring-[#2484C6]"
                      />
                    </th>
                  )}
                  <th className="p-4">Employee ID</th>
                  <th className="p-4">Full Name</th>
                  <th className="p-4">Designation Role</th>
                  <th className="p-4">System Role</th>
                  <th className="p-4">Assigned Projects</th>
                  {currentUser?.role === 'Admin' && <th className="p-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredEmployees.map(emp => {
                  const isEditing = editingId === emp.id;
                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer group"
                    >
                      {/* Checkbox column */}
                      {(currentUser?.role === 'Admin' || currentUser?.role === 'Project Manager' || currentUser?.role === 'Lead') && (
                        <td className="p-4 w-8">
                          {(emp.role === 'Employee' || emp.role === 'Lead') ? (
                            <input
                              aria-label={`Select employee ${emp.name}`}
                              type="checkbox"
                              checked={selectedEmployeeIds.includes(emp.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEmployeeIds([...selectedEmployeeIds, emp.id]);
                                } else {
                                  setSelectedEmployeeIds(selectedEmployeeIds.filter(id => id !== emp.id));
                                }
                              }}
                              className="rounded border-[var(--border-subtle)] bg-[var(--input-bg)] focus:ring-[#2484C6]"
                            />
                          ) : (
                            <span className="text-[var(--text-muted)] italic text-[10px]">-</span>
                          )}
                        </td>
                      )}

                      {/* Employee ID column */}
                      <td className="p-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={formEmpId}
                            onChange={e => setFormEmpId(e.target.value)}
                            className="px-2.5 py-1 text-xs rounded-md bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58] max-w-28 font-mono"
                          />
                        ) : (
                          <span className="font-mono text-[var(--text-muted)] text-xs font-medium">
                            {emp.employeeId}
                          </span>
                        )}
                      </td>

                      {/* Full Name column */}
                      <td className="p-4 font-semibold text-[var(--text-main)]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={formName}
                            onChange={e => setFormName(e.target.value)}
                            className="px-2.5 py-1 text-xs rounded-md bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58] w-full max-w-xs font-sans"
                          />
                        ) : (
                          <span className="group-hover:text-[#1DAA58] transition-colors">{emp.name}</span>
                        )}
                      </td>

                      {/* Designation Role column */}
                      <td className="p-4">
                        {isEditing ? (
                          <select
                            value={formDesignation}
                            onChange={e => setFormDesignation(e.target.value)}
                            className="px-2.5 py-1 text-xs rounded-md bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58]"
                          >
                            <option value="Storyboard">Storyboard</option>
                            <option value="Developer">Developer</option>
                            <option value="QA">QA</option>
                            <option value="Project Manager">Project Manager</option>
                            <option value="Designer">Designer</option>
                          </select>
                        ) : (
                          <span className="text-[var(--text-main)] text-xs font-medium">
                            {emp.designation}
                          </span>
                        )}
                      </td>

                      {/* System Role column */}
                      <td className="p-4">
                        {isEditing ? (
                          <select
                            value={formRole}
                            onChange={e => setFormRole(e.target.value as any)}
                            className="px-2.5 py-1 text-xs rounded-md bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58]"
                          >
                            <option value="Employee">Employee</option>
                            <option value="Lead">Lead</option>
                            <option value="Project Manager">Project Manager</option>
                            {currentUser?.role === 'Admin' && <option value="Admin">Admin</option>}
                          </select>
                        ) : (
                          <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold border tracking-wide uppercase ${
                            emp.role === 'Admin'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : emp.role === 'Project Manager'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : emp.role === 'Lead'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          }`}>
                            {emp.role || 'Employee'}
                          </span>
                        )}
                      </td>

                      {/* Assigned Projects Badges */}
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                          {(() => {
                            const linkedProjs = projectLinks
                              .filter(link => link.employee_id === emp.id)
                              .map(link => projects.find(p => p.id === link.project_id))
                              .filter(Boolean) as Project[];
                            
                            if (linkedProjs.length === 0) {
                              return <span className="text-[var(--text-muted)] italic text-[11px]">No active projects</span>;
                            }
                            return linkedProjs.map(proj => (
                              <span
                                key={proj.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold bg-[var(--input-bg)] border border-[var(--border-subtle)] text-[var(--text-main)] transition-all hover:border-[#2484C6]/60 shadow-xs"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#2484C6]" />
                                <span>{proj.name}</span>
                                {(currentUser?.role === 'Admin' || currentUser?.role === 'Project Manager') && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const sb = getSupabase();
                                      if (sb) {
                                        await sb.from('employee_project_links').delete().eq('project_id', proj.id).eq('employee_id', emp.id);
                                        await loadProjectsAndLinks();
                                        if (onDirectoryChanged) onDirectoryChanged();
                                      }
                                    }}
                                    className="text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 rounded p-0.5 transition-colors font-bold ml-0.5 cursor-pointer flex items-center justify-center"
                                    title="Revoke Project"
                                  >
                                    ✕
                                  </button>
                                )}
                              </span>
                            ));
                          })()}
                        </div>
                      </td>

                      {/* Action buttons */}
                      {currentUser?.role === 'Admin' && (
                        <td className="p-4 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleSaveEdit(emp.id)}
                                className="p-1 hover:bg-emerald-500/20 text-emerald-400 rounded cursor-pointer"
                                title="Save changes"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-1 hover:bg-rose-500/20 text-rose-400 rounded cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleStartEdit(emp)}
                                className="p-1.5 hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg cursor-pointer transition-colors"
                                title="Edit record"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(emp.id)}
                                className="p-1.5 hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-400 rounded-lg cursor-pointer transition-colors"
                                title="Delete employee"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Created Password Confirmation Modal */}
      {createdPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className={`w-full max-w-sm p-6 rounded-lg border shadow-xl ${
            theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            {createdPasswordModal.linkedOnly ? (
              <>
                <h3 className="text-sm font-bold text-[#2484C6] mb-3 flex items-center gap-1.5 uppercase tracking-wide">
                  <Check className="w-4 h-4" />
                  <span>Employee Linked</span>
                </h3>
                <p className="text-xs text-neutral-400 mb-4 leading-normal">
                  This employee already exists — linking them to your projects.
                </p>
                <div className="p-3 bg-neutral-900/50 rounded-md border border-neutral-800 space-y-2 text-xs font-mono mb-5">
                  <div>
                    <span className="text-[10px] text-neutral-500 block">NAME</span>
                    <span className="text-neutral-300 font-bold">{createdPasswordModal.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-500 block">EMAIL ADDRESS</span>
                    <span className="text-neutral-300 font-bold">{createdPasswordModal.email}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-1.5 uppercase tracking-wide">
                  <Check className="w-4 h-4" />
                  <span>Account Created Successfully</span>
                </h3>
                <p className="text-xs text-neutral-450 mb-4 leading-normal">
                  An authentication account has been registered for <strong>{createdPasswordModal.name}</strong>. Please share these credentials with them:
                </p>
                <div className="p-3 bg-neutral-900/50 rounded-md border border-neutral-800 space-y-2 text-xs font-mono mb-5">
                  <div>
                    <span className="text-[10px] text-neutral-500 block">EMAIL ADDRESS</span>
                    <span className="text-neutral-300 font-bold select-all">{createdPasswordModal.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-500 block">TEMPORARY PASSWORD</span>
                    <span className="text-emerald-400 font-bold text-sm select-all">{createdPasswordModal.password}</span>
                  </div>
                </div>
              </>
            )}
            <button
              onClick={() => setCreatedPasswordModal(null)}
              className="w-full py-2 bg-gradient-to-r from-[#1DAA58] to-[#2484C6] hover:brightness-110 active:scale-98 text-white text-xs font-bold rounded-md transition-all shadow-md cursor-pointer"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}

      {/* Custom Confirm Modal */}
      {confirmModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setConfirmModal(null)}
        >
          <div 
            className={`max-w-md w-full p-6 rounded-lg border text-xs shadow-2xl ${
              theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-amber-500 mb-2 uppercase tracking-wide flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Confirm Action</span>
            </h3>
            <p className="mb-4 text-neutral-450 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className={`px-3 py-1.5 border rounded font-semibold hover:bg-neutral-500/10 cursor-pointer ${
                  theme === 'dark' ? 'border-neutral-750 text-neutral-350' : 'border-neutral-300 text-neutral-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-3 py-1.5 bg-[#2484C6] hover:brightness-110 text-white rounded font-bold transition-all shadow-md active:scale-97 cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
