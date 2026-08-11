import React, { useState, useEffect } from 'react';
import { Settings, PlusCircle, Trash, Check, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { FileRole, ColumnMappingConfig, PhaseColumnMapping, CustomColumnMapping } from '../types';
import { suggestHeaderMappings } from '../utils/smartMatcher';


interface MappingSuiteProps {
  theme: 'dark' | 'light';
  filename: string;
  fileRole: FileRole;
  headers: string[];
  onMappingApplied: (config: ColumnMappingConfig) => void;
  savedConfig?: ColumnMappingConfig;
}

export default function MappingSuite({
  theme,
  filename,
  fileRole,
  headers,
  onMappingApplied,
  savedConfig
}: MappingSuiteProps) {
  // Let's populate default mappings if available
  const [courseCol, setCourseCol] = useState('');
  const [moduleCol, setModuleCol] = useState('');
  const [languageCol, setLanguageCol] = useState('');
  
  // Custom list of active phases with columns
  const [phasesList, setPhasesList] = useState<PhaseColumnMapping[]>([
    { phaseName: '', phaseType: '', phaseTypePhase: '', clientDateCol: '', internalStartDateCol: '', internalEndDateCol: '' }
  ]);

  // Dynamic custom column mappings state
  const [customMappings, setCustomMappings] = useState<CustomColumnMapping[]>([]);

  // Alert/success states
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successApplied, setSuccessApplied] = useState(false);

  // Auto-detect standard columns using smartMatcher engine
  const runSmartAutoMap = () => {
    const suggestions = suggestHeaderMappings(headers, [], fileRole);

    Object.entries(suggestions).forEach(([header, match]) => {
      if (match.confidence >= 50) {
        if (match.targetField === 'courseCode' || match.targetField === 'courseName') {
          setCourseCol((prev) => prev || header);
        } else if (match.targetField === 'moduleCode' || match.targetField === 'moduleName') {
          setModuleCol((prev) => prev || header);
        } else if (match.targetField === 'language') {
          setLanguageCol((prev) => prev || header);
        }
      }
    });
  };

  useEffect(() => {
    if (savedConfig) {
      setCourseCol(savedConfig.courseCol || '');
      setModuleCol(savedConfig.moduleCol || '');
      setLanguageCol(savedConfig.languageCol || '');
      if (savedConfig.phases && savedConfig.phases.length > 0) {
        setPhasesList(savedConfig.phases);
      }
      if (savedConfig.customMappings) {
        setCustomMappings(savedConfig.customMappings);
      }
    } else {
      runSmartAutoMap();

      // Auto-detect phase columns
      const potentialPhases: PhaseColumnMapping[] = [];
      const phaseKeywords = ['review', 'translation', 'uat', 'delivery', 'qa', 'test', 'signoff', 'l10n'];
      
      phaseKeywords.forEach(keyword => {
        if (fileRole === 'client') {
          const col = headers.find(h => h.toLowerCase().includes(keyword) && !h.toLowerCase().includes('start') && !h.toLowerCase().includes('end'));
          if (col) {
            potentialPhases.push({
              phaseName: keyword.toUpperCase(),
              clientDateCol: col,
            });
          }
        } else {
          const startCol = headers.find(h => h.toLowerCase().includes(keyword) && h.toLowerCase().includes('start'));
          const endCol = headers.find(h => h.toLowerCase().includes(keyword) && h.toLowerCase().includes('end'));
          if (startCol || endCol) {
            potentialPhases.push({
              phaseName: keyword.toUpperCase(),
              internalStartDateCol: startCol || '',
              internalEndDateCol: endCol || '',
            });
          }
        }
      });

      if (potentialPhases.length > 0) {
        setPhasesList(potentialPhases);
      } else {
        // Fallback placeholder
        setPhasesList([{
          phaseName: 'DELIVERY',
          clientDateCol: headers.find(h => h.toLowerCase().includes('date')) || '',
          internalStartDateCol: '',
          internalEndDateCol: '',

        }]);
      }
    }
  }, [headers, fileRole, savedConfig]);

  const addPhaseRow = () => {
    setPhasesList([...phasesList, { phaseName: '', phaseType: '', phaseTypePhase: '', clientDateCol: '', internalStartDateCol: '', internalEndDateCol: '' }]);
  };

  const updatePhaseRow = (index: number, updated: Partial<PhaseColumnMapping>) => {
    const list = [...phasesList];
    list[index] = { ...list[index], ...updated };
    setPhasesList(list);
  };

  const removePhaseRow = (index: number) => {
    const list = phasesList.filter((_, i) => i !== index);
    if (list.length === 0) {
      setPhasesList([{ phaseName: '', phaseType: '', phaseTypePhase: '', clientDateCol: '', internalStartDateCol: '', internalEndDateCol: '' }]);
    } else {
      setPhasesList(list);
    }
  };

  const movePhaseRow = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === phasesList.length - 1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const list = [...phasesList];
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    setPhasesList(list);
  };

  const addCustomColRow = () => {
    setCustomMappings([...customMappings, { displayName: '', spreadsheetCol: '', targetEntity: 'module' }]);
  };

  const updateCustomColRow = (index: number, updated: Partial<CustomColumnMapping>) => {
    const list = [...customMappings];
    list[index] = { ...list[index], ...updated } as CustomColumnMapping;
    setCustomMappings(list);
  };

  const removeCustomColRow = (index: number) => {
    setCustomMappings(customMappings.filter((_, i) => i !== index));
  };

  const moveCustomColRow = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === customMappings.length - 1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const list = [...customMappings];
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    setCustomMappings(list);
  };

  const handleApplyConfig = () => {
    setErrorStatus(null);
    setSuccessApplied(false);

    if (!courseCol) {
      setErrorStatus('Course structural column mapping is required.');
      return;
    }
    if (!moduleCol) {
      setErrorStatus('Module structural column mapping is required.');
      return;
    }

    // Validate phase column rows
    const cleanedPhases: PhaseColumnMapping[] = [];
    for (let idx = 0; idx < phasesList.length; idx++) {
      const ph = phasesList[idx];
      if (!ph.phaseName.trim()) {
        setErrorStatus(`Phase #${idx + 1} is missing a Phase Name.`);
        return;
      }
      
      if (fileRole === 'client') {
        if (!ph.clientDateCol) {
          setErrorStatus(`Milestone date column is missing for phase of: "${ph.phaseName}"`);
          return;
        }
        cleanedPhases.push({
          phaseName: ph.phaseName.trim(),
          phaseType: ph.phaseType?.trim() || undefined,
          phaseTypePhase: ph.phaseTypePhase?.trim() || undefined,
          phaseSequence: idx + 1,
          clientDateCol: ph.clientDateCol,
          anchorInternalPhase: ph.anchorInternalPhase || 'None',
          anchorPoint: ph.anchorPoint || 'End'
        } as any);
      } else {
        if (!ph.internalStartDateCol && !ph.internalEndDateCol) {
          setErrorStatus(`At least one date parameter (Start Date or End Date) is required for internal phase: "${ph.phaseName}"`);
          return;
        }
        cleanedPhases.push({
          phaseName: ph.phaseName.trim(),
          phaseType: ph.phaseType?.trim() || undefined,
          phaseTypePhase: ph.phaseTypePhase?.trim() || undefined,
          phaseSequence: idx + 1,
          internalStartDateCol: ph.internalStartDateCol || '',
          internalEndDateCol: ph.internalEndDateCol || ''
        } as any);
      }
    }

    const cleanedCustom: CustomColumnMapping[] = [];
    for (const cm of customMappings) {
      if (!cm.displayName.trim() || !cm.spreadsheetCol) {
        setErrorStatus('All custom column mappings must have a Display Name and Spreadsheet Column selected.');
        return;
      }
      cleanedCustom.push({
        displayName: cm.displayName.trim(),
        spreadsheetCol: cm.spreadsheetCol,
        targetEntity: cm.targetEntity,
        phaseName: cm.targetEntity === 'phase' ? cm.phaseName : undefined
      });
    }

    const config: ColumnMappingConfig = {
      fileRole,
      courseCol,
      moduleCol,
      languageCol: languageCol || undefined,
      phases: cleanedPhases,
      customMappings: cleanedCustom
    };

    onMappingApplied(config);
    setSuccessApplied(true);
    setTimeout(() => {
      setSuccessApplied(false);
    }, 3000);
  };

  return (
    <div
      id={`mapping-suite-${fileRole}`}
      className={`p-5 rounded-xl border transition-all hover-card-glow ${
        theme === 'dark'
          ? 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-white shadow-xl'
          : 'bg-white border-neutral-200 text-neutral-800 shadow-md'
      }`}
    >
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#B1B7C3]/10">
        <Settings className="w-4 h-4 text-[#2484C6]" />
        <h3 className="text-sm font-semibold">
          Set Column Mappings: <span className="font-mono text-xs text-neutral-400">{filename}</span>
        </h3>
      </div>

      {errorStatus && (
        <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/25 text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
          <span>{errorStatus}</span>
        </div>
      )}

      {/* Structural Mapping */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-xs font-semibold text-neutral-400 mb-1">
            Course ID / Code Column <span className="text-rose-400">*</span>
          </label>
          <select
            aria-label="Select Course Column"
            value={courseCol}
            onChange={(e) => setCourseCol(e.target.value)}
            className={`w-full px-2.5 py-1.5 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
              theme === 'dark' ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-100 border-neutral-300 text-neutral-950'
            }`}
          >
            <option value="">-- Choose Column --</option>
            {headers.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-400 mb-1">
            Module ID / Code Column <span className="text-rose-400">*</span>
          </label>
          <select
            aria-label="Select Module Column"
            value={moduleCol}
            onChange={(e) => setModuleCol(e.target.value)}
            className={`w-full px-2.5 py-1.5 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
              theme === 'dark' ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-100 border-neutral-300 text-neutral-950'
            }`}
          >
            <option value="">-- Choose Column --</option>
            {headers.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-400 mb-1">
            Language / Locale (Optional)
          </label>
          <select
            aria-label="Select Language Column"
            value={languageCol}
            onChange={(e) => setLanguageCol(e.target.value)}
            className={`w-full px-2.5 py-1.5 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
              theme === 'dark' ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-100 border-neutral-300 text-neutral-950'
            }`}
          >
            <option value="">-- No Language/Locale Column --</option>
            {headers.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Phase Date Mapping Grid */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-neutral-400 uppercase tracking-wide">
            Phase Target Dates Parameters ({fileRole === 'client' ? 'Client' : 'Internal'})
          </label>
          <button
            type="button"
            onClick={addPhaseRow}
            className="text-xs text-[#2484C6] hover:text-[#1DAA58] flex items-center gap-1 font-medium transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Phase</span>
          </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {phasesList.map((ph, index) => (
            <div
              key={index}
              className={`p-3 rounded-md flex flex-col sm:flex-row items-stretch sm:items-center gap-3 transition-colors ${
                theme === 'dark' ? 'bg-neutral-800/60 border border-neutral-700/60' : 'bg-neutral-50 border border-neutral-200'
              }`}
            >
              <div className="flex-none px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold text-center self-center" title="Auto-assigned phase sequence number">
                #{index + 1}
              </div>

              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Phase Name (e.g. UAT)"
                  value={ph.phaseName}
                  onChange={(e) => updatePhaseRow(index, { phaseName: e.target.value })}
                  className={`w-full px-2.5 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                    theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                  }`}
                />
              </div>

              {/* Phase Type text input — positioned between Name and Date */}
              <div className="flex-none w-28">
                <input
                  type="text"
                  placeholder="Type (e.g. Alpha)"
                  value={ph.phaseType || ''}
                  onChange={(e) => updatePhaseRow(index, { phaseType: e.target.value })}
                  title="Phase type label — e.g. Alpha, Beta, LMS, QA. Used for filtering."
                  className={`w-full px-2.5 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#2484C6] ${
                    theme === 'dark' ? 'bg-neutral-900 border-[#2484C6]/30 text-white placeholder-neutral-600' : 'bg-white border-[#2484C6]/40 text-neutral-950 placeholder-neutral-400'
                  }`}
                />
              </div>

              {/* Phase Type Phase text input — positioned between Type and Date */}
              <div className="flex-none w-28">
                <input
                  type="text"
                  placeholder="Type Phase"
                  value={ph.phaseTypePhase || ''}
                  onChange={(e) => updatePhaseRow(index, { phaseTypePhase: e.target.value })}
                  title="Phase type phase label — e.g. Phase 1, Phase 2. Used for table display."
                  className={`w-full px-2.5 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#2484C6] ${
                    theme === 'dark' ? 'bg-neutral-900 border-[#2484C6]/30 text-white placeholder-neutral-600' : 'bg-white border-[#2484C6]/40 text-neutral-950 placeholder-neutral-400'
                  }`}
                />
              </div>

              {fileRole === 'client' ? (
                <div className="flex-1 flex gap-2 items-center">
                  <select
                    aria-label={`Select Client Date for Phase ${index + 1}`}
                    value={ph.clientDateCol || ''}
                    onChange={(e) => updatePhaseRow(index, { clientDateCol: e.target.value })}
                    className={`w-1/2 px-2.5 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                    }`}
                  >
                    <option value="">-- Client Date Col --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={ph.anchorInternalPhase || ''}
                    onChange={(e) => updatePhaseRow(index, { anchorInternalPhase: e.target.value })}
                    placeholder="Anchor Internal Phase"
                    title="Specify internal phase name to pair this client milestone date against"
                    className={`w-1/3 px-2 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#2484C6] ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                    }`}
                  />

                  <button
                    type="button"
                    onClick={() => updatePhaseRow(index, { anchorPoint: (ph.anchorPoint || 'End') === 'End' ? 'Start' : 'End' })}
                    title="Toggle anchor point between Start Date and End Date"
                    className={`px-2 py-1 text-[11px] font-semibold rounded border cursor-pointer ${
                      (ph.anchorPoint || 'End') === 'End'
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    }`}
                  >
                    {ph.anchorPoint || 'End'} Date
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex gap-2">
                  <select
                    aria-label={`Select Internal Start Date for Phase ${index + 1}`}
                    value={ph.internalStartDateCol || ''}
                    onChange={(e) => updatePhaseRow(index, { internalStartDateCol: e.target.value })}
                    className={`w-1/2 px-2 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                    }`}
                  >
                    <option value="">-- Start Date Col --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>

                  <select
                    aria-label={`Select Internal End Date for Phase ${index + 1}`}
                    value={ph.internalEndDateCol || ''}
                    onChange={(e) => updatePhaseRow(index, { internalEndDateCol: e.target.value })}
                    className={`w-1/2 px-2 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                    }`}
                  >
                    <option value="">-- End Date Col --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-1 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => movePhaseRow(index, 'up')}
                  disabled={index === 0}
                  className="p-1 text-neutral-400 hover:text-emerald-500 disabled:opacity-30 rounded-md transition-colors text-xs cursor-pointer"
                  title="Move Phase Up (Decreases sequence #)"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => movePhaseRow(index, 'down')}
                  disabled={index === phasesList.length - 1}
                  className="p-1 text-neutral-400 hover:text-emerald-500 disabled:opacity-30 rounded-md transition-colors text-xs cursor-pointer"
                  title="Move Phase Down (Increases sequence #)"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removePhaseRow(index)}
                  className="p-1 text-neutral-400 hover:text-rose-500 rounded-md transition-colors text-xs cursor-pointer"
                  title="Remove Phase line"
                >
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Dynamic Custom Column Mappings */}
      <div className="space-y-3 mb-6 pt-4 border-t border-[#B1B7C3]/10">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-neutral-400 uppercase tracking-wide">
            Dynamic Custom Column Mappings (e.g. Screen Count)
          </label>
          <button
            type="button"
            onClick={addCustomColRow}
            className="text-xs text-[#2484C6] hover:text-[#1DAA58] flex items-center gap-1 font-medium transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Custom Column</span>
          </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {customMappings.length === 0 ? (
            <p className="text-[11px] text-neutral-500 italic py-2 text-center bg-neutral-500/5 rounded-md">
              No custom columns mapped yet.
            </p>
          ) : (
            customMappings.map((cm, index) => (
              <div
                key={index}
                className={`p-3 rounded-md flex flex-col sm:flex-row items-stretch sm:items-center gap-2 transition-colors ${
                  theme === 'dark' ? 'bg-neutral-800/60 border border-neutral-700/60' : 'bg-neutral-50 border border-neutral-200'
                }`}
              >
                {/* Rearrange buttons */}
                <div className="flex sm:flex-col gap-1 justify-center">
                  <button
                    type="button"
                    onClick={() => moveCustomColRow(index, 'up')}
                    disabled={index === 0}
                    className="p-0.5 text-neutral-500 hover:text-neutral-300 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCustomColRow(index, 'down')}
                    disabled={index === customMappings.length - 1}
                    className="p-0.5 text-neutral-500 hover:text-neutral-300 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Display Name */}
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Custom Col Name (e.g. Screen Count)"
                    value={cm.displayName}
                    onChange={(e) => updateCustomColRow(index, { displayName: e.target.value })}
                    className={`w-full px-2.5 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                    }`}
                  />
                </div>

                {/* Spreadsheet Column Selector */}
                <div className="flex-1">
                  <select
                    aria-label={`Select Spreadsheet Column for Custom Mapping ${index + 1}`}
                    value={cm.spreadsheetCol}
                    onChange={(e) => updateCustomColRow(index, { spreadsheetCol: e.target.value })}
                    className={`w-full px-2.5 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                    }`}
                  >
                    <option value="">-- Spreadsheet Column --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Target Entity Selector */}
                <div className="flex-none w-28">
                  <select
                    aria-label={`Select Target Entity for Custom Mapping ${index + 1}`}
                    value={cm.targetEntity}
                    onChange={(e) => updateCustomColRow(index, { targetEntity: e.target.value as 'module' | 'phase', phaseName: '' })}
                    className={`w-full px-2.5 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                    }`}
                  >
                    <option value="module">Module-level</option>
                    <option value="phase">Phase-level</option>
                  </select>
                </div>

                {/* Phase Name Selector (Conditional) */}
                {cm.targetEntity === 'phase' && (
                  <div className="flex-none w-36">
                    <select
                      aria-label={`Select Target Phase for Custom Mapping ${index + 1}`}
                      value={cm.phaseName || ''}
                      onChange={(e) => updateCustomColRow(index, { phaseName: e.target.value })}
                      className={`w-full px-2.5 py-1 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                        theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                      }`}
                    >
                      <option value="">-- Apply to Phase --</option>
                      {phasesList.map(ph => (
                        <option key={ph.phaseName} value={ph.phaseName}>{ph.phaseName}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => removeCustomColRow(index)}
                  className="p-1 text-neutral-400 hover:text-rose-500 rounded-md transition-colors text-xs flex self-end sm:self-auto cursor-pointer"
                  title="Remove Custom Column Mapping"
                >
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-[#B1B7C3]/10">
        <p className="text-[10px] text-neutral-400 select-none">
          Verify and click Apply mapping.
        </p>
        <button
          onClick={handleApplyConfig}
          className={`px-4 py-2 text-xs font-semibold text-white rounded-md flex items-center gap-1.5 transition-all shadow-sm active:scale-97 ${
            successApplied
              ? 'bg-[#1DAA58]'
              : 'bg-gradient-to-r from-[#2484C6] to-[#008DA5] hover:brightness-110'
          }`}
        >
          {successApplied ? <Check className="w-3.5 h-3.5 animate-pulse" /> : null}
          <span>{successApplied ? 'Applied ✓' : 'Apply Mapping'}</span>
        </button>
      </div>
    </div>
  );
}
