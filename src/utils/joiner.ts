/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColumnMappingConfig, JoinResultRow } from '../types';

/**
 * Builds a composite matching key for rows
 */
function makeKey(course: string, module: string, lang?: string): string {
  const normC = (course || '').trim().toLowerCase();
  const normM = (module || '').trim().toLowerCase();
  const normL = (lang || '').trim().toLowerCase();
  return `${normC}|||${normM}|||${normL}`;
}

/**
 * Executes core join logic
 */
export function executeJoin(
  clientRows: Record<string, any>[],
  clientConfig: ColumnMappingConfig,
  internalRows: Record<string, any>[],
  internalConfig: ColumnMappingConfig
): JoinResultRow[] {
  const joinResults: JoinResultRow[] = [];
  
  // Maps to look up rows by composite key
  const clientMap = new Map<string, { rows: Record<string, any>[] }>();
  const internalMap = new Map<string, { rows: Record<string, any>[] }>();
  
  // Set of all composite keys across both files
  const allKeys = new Set<string>();
 
  // Process Client rows
  clientRows.forEach((row) => {
    const crs = String(row[clientConfig.courseCol] || '').trim();
    const mod = String(row[clientConfig.moduleCol] || '').trim();
    const lang = clientConfig.languageCol ? String(row[clientConfig.languageCol] || '').trim() : '';
    
    // Skip empty course/module rows
    if (!crs && !mod) return;
    
    const key = makeKey(crs, mod, lang);
    allKeys.add(key);
    
    if (!clientMap.has(key)) {
      clientMap.set(key, { rows: [] });
    }
    clientMap.get(key)!.rows.push(row);
  });
 
  // Process Internal rows
  internalRows.forEach((row) => {
    const crs = String(row[internalConfig.courseCol] || '').trim();
    const mod = String(row[internalConfig.moduleCol] || '').trim();
    const lang = internalConfig.languageCol ? String(row[internalConfig.languageCol] || '').trim() : '';
    
    // Skip empty course/module rows
    if (!crs && !mod) return;
 
    const key = makeKey(crs, mod, lang);
    allKeys.add(key);
 
    if (!internalMap.has(key)) {
      internalMap.set(key, { rows: [] });
    }
    internalMap.get(key)!.rows.push(row);
  });
 
  // Build the list of all distinct phase names across both configs
  const clientPhaseNames = clientConfig.phases.map(p => p.phaseName);
  const internalPhaseNames = internalConfig.phases.map(p => p.phaseName);
  const allPhaseNames = Array.from(new Set([...clientPhaseNames, ...internalPhaseNames]));
 
  // Perform join matching on all keys
  allKeys.forEach((key) => {
    const clientEntry = clientMap.get(key);
    const internalEntry = internalMap.get(key);
 
    if (clientEntry && internalEntry) {
      // MATCHED ROW
      clientEntry.rows.forEach(cRow => {
        internalEntry.rows.forEach(iRow => {
          const phasesList = allPhaseNames.map(phaseName => {
            const cPhaseMap = clientConfig.phases.find(p => p.phaseName === phaseName);
            const clientDateVal = cPhaseMap && cPhaseMap.clientDateCol ? cRow[cPhaseMap.clientDateCol] : null;
 
            const iPhaseMap = internalConfig.phases.find(p => p.phaseName === phaseName);
            const internalStartVal = iPhaseMap && iPhaseMap.internalStartDateCol ? iRow[iPhaseMap.internalStartDateCol] : null;
            const internalEndVal = iPhaseMap && iPhaseMap.internalEndDateCol ? iRow[iPhaseMap.internalEndDateCol] : null;
 
            const phaseType = cPhaseMap?.phaseType || iPhaseMap?.phaseType || null;
            const phaseTypePhase = cPhaseMap?.phaseTypePhase || iPhaseMap?.phaseTypePhase || null;
            const sourceFile: 'Client' | 'Internal' | null = cPhaseMap ? 'Client' : (iPhaseMap ? 'Internal' : null);
            const origin: 'delivery_sheet' | 'development_sheet' | undefined = cPhaseMap ? 'delivery_sheet' : (iPhaseMap ? 'development_sheet' : undefined);
 
            return {
              phaseName,
              phaseType,
              phaseTypePhase,
              sourceFile,
              origin,
              clientDate: clientDateVal ? String(clientDateVal).trim() : null,
              internalStartDate: internalStartVal ? String(internalStartVal).trim() : null,
              internalEndDate: internalEndVal ? String(internalEndVal).trim() : null,
              metadata: {} as Record<string, any>,
              clientMetadata: {} as Record<string, any>,
              internalMetadata: {} as Record<string, any>
            };
          });

          const moduleMetadata: Record<string, any> = {};
          const clientCustomMetadata: Record<string, any> = {};
          const internalCustomMetadata: Record<string, any> = {};
          
          const extractCustom = (rowObj: Record<string, any>, configObj: ColumnMappingConfig, targetPhases: typeof phasesList) => {
            if (configObj.customMappings) {
              configObj.customMappings.forEach(cm => {
                const val = rowObj[cm.spreadsheetCol];
                if (val !== undefined && val !== null) {
                  const role = configObj.fileRole || 'client';
                  const keyName = cm.displayName;
                  const prefixedKey = `${role}:${keyName}`;

                  if (cm.targetEntity === 'module') {
                    moduleMetadata[prefixedKey] = val;
                    if (role === 'client') {
                      clientCustomMetadata[keyName] = val;
                    } else {
                      internalCustomMetadata[keyName] = val;
                    }
                  } else if (cm.targetEntity === 'phase' && cm.phaseName) {
                    const targetPh = targetPhases.find(p => p.phaseName === cm.phaseName);
                    if (targetPh) {
                      if (!targetPh.metadata) targetPh.metadata = {};
                      targetPh.metadata[prefixedKey] = val;
                      if (role === 'client') {
                        if (!targetPh.clientMetadata) targetPh.clientMetadata = {};
                        targetPh.clientMetadata[keyName] = val;
                      } else {
                        if (!targetPh.internalMetadata) targetPh.internalMetadata = {};
                        targetPh.internalMetadata[keyName] = val;
                      }
                    }
                  }
                }
              });
            }
          };

          extractCustom(cRow, clientConfig, phasesList);
          extractCustom(iRow, internalConfig, phasesList);
 
          const crsCode = String(cRow[clientConfig.courseCol] || '').trim();
          const modCode = String(cRow[clientConfig.moduleCol] || '').trim();
          const langVal = clientConfig.languageCol ? String(cRow[clientConfig.languageCol] || '').trim() : undefined;
 
          joinResults.push({
            courseCode: crsCode,
            courseName: crsCode,
            moduleCode: modCode,
            moduleName: modCode,
            language: langVal,
            status: 'matched',
            moduleMetadata,
            clientCustomMetadata,
            internalCustomMetadata,
            phases: phasesList
          });
        });
      });
    } else if (clientEntry) {
      // CLIENT-ONLY
      clientEntry.rows.forEach(cRow => {
        const phasesList = allPhaseNames.map(phaseName => {
          const cPhaseMap = clientConfig.phases.find(p => p.phaseName === phaseName);
          const clientDateVal = cPhaseMap && cPhaseMap.clientDateCol ? cRow[cPhaseMap.clientDateCol] : null;
          const phaseType = cPhaseMap?.phaseType || null;
          const phaseTypePhase = cPhaseMap?.phaseTypePhase || null;
 
          return {
            phaseName,
            phaseType,
            phaseTypePhase,
            sourceFile: 'Client' as const,
            origin: 'delivery_sheet' as const,
            clientDate: clientDateVal ? String(clientDateVal).trim() : null,
            internalStartDate: null,
            internalEndDate: null,
            metadata: {} as Record<string, any>,
            clientMetadata: {} as Record<string, any>,
            internalMetadata: {} as Record<string, any>
          };
        });

        const moduleMetadata: Record<string, any> = {};
        const clientCustomMetadata: Record<string, any> = {};
        if (clientConfig.customMappings) {
          clientConfig.customMappings.forEach(cm => {
            const val = cRow[cm.spreadsheetCol];
            if (val !== undefined && val !== null) {
              const keyName = cm.displayName;
              const prefixedKey = `client:${keyName}`;
              if (cm.targetEntity === 'module') {
                moduleMetadata[prefixedKey] = val;
                clientCustomMetadata[keyName] = val;
              } else if (cm.targetEntity === 'phase' && cm.phaseName) {
                const targetPh = phasesList.find(p => p.phaseName === cm.phaseName);
                if (targetPh) {
                  if (!targetPh.metadata) targetPh.metadata = {};
                  targetPh.metadata[prefixedKey] = val;
                  if (!targetPh.clientMetadata) targetPh.clientMetadata = {};
                  targetPh.clientMetadata[keyName] = val;
                }
              }
            }
          });
        }
 
        const crsCode = String(cRow[clientConfig.courseCol] || '').trim();
        const modCode = String(cRow[clientConfig.moduleCol] || '').trim();
        const langVal = clientConfig.languageCol ? String(cRow[clientConfig.languageCol] || '').trim() : undefined;
 
        joinResults.push({
          courseCode: crsCode,
          courseName: crsCode,
          moduleCode: modCode,
          moduleName: modCode,
          language: langVal,
          status: 'client-only',
          moduleMetadata,
          clientCustomMetadata,
          phases: phasesList
        });
      });
    } else if (internalEntry) {
      // INTERNAL-ONLY
      internalEntry.rows.forEach(iRow => {
        const phasesList = allPhaseNames.map(phaseName => {
          const iPhaseMap = internalConfig.phases.find(p => p.phaseName === phaseName);
          const internalStartVal = iPhaseMap && iPhaseMap.internalStartDateCol ? iRow[iPhaseMap.internalStartDateCol] : null;
          const internalEndVal = iPhaseMap && iPhaseMap.internalEndDateCol ? iRow[iPhaseMap.internalEndDateCol] : null;
          const phaseType = iPhaseMap?.phaseType || null;
          const phaseTypePhase = iPhaseMap?.phaseTypePhase || null;
 
          return {
            phaseName,
            phaseType,
            phaseTypePhase,
            sourceFile: 'Internal' as const,
            origin: 'development_sheet' as const,
            clientDate: null,
            internalStartDate: internalStartVal ? String(internalStartVal).trim() : null,
            internalEndDate: internalEndVal ? String(internalEndVal).trim() : null,
            metadata: {} as Record<string, any>,
            clientMetadata: {} as Record<string, any>,
            internalMetadata: {} as Record<string, any>
          };
        });

        const moduleMetadata: Record<string, any> = {};
        const internalCustomMetadata: Record<string, any> = {};
        if (internalConfig.customMappings) {
          internalConfig.customMappings.forEach(cm => {
            const val = iRow[cm.spreadsheetCol];
            if (val !== undefined && val !== null) {
              const keyName = cm.displayName;
              const prefixedKey = `internal:${keyName}`;
              if (cm.targetEntity === 'module') {
                moduleMetadata[prefixedKey] = val;
                internalCustomMetadata[keyName] = val;
              } else if (cm.targetEntity === 'phase' && cm.phaseName) {
                const targetPh = phasesList.find(p => p.phaseName === cm.phaseName);
                if (targetPh) {
                  if (!targetPh.metadata) targetPh.metadata = {};
                  targetPh.metadata[prefixedKey] = val;
                  if (!targetPh.internalMetadata) targetPh.internalMetadata = {};
                  targetPh.internalMetadata[keyName] = val;
                }
              }
            }
          });
        }
 
        const crsCode = String(iRow[internalConfig.courseCol] || '').trim();
        const modCode = String(iRow[internalConfig.moduleCol] || '').trim();
        const langVal = internalConfig.languageCol ? String(iRow[internalConfig.languageCol] || '').trim() : undefined;
 
        joinResults.push({
          courseCode: crsCode,
          courseName: crsCode,
          moduleCode: modCode,
          moduleName: modCode,
          language: langVal,
          status: 'internal-only',
          moduleMetadata,
          internalCustomMetadata,
          phases: phasesList
        });
      });
    }
  });
 
  return joinResults;
}
