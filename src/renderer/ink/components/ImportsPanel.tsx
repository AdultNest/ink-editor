/**
 * ImportsPanel component
 *
 * Sidebar panel displaying all EXTERNAL function declarations in the ink file.
 * Shows imported functions and their parameters, with warnings for unknown methods.
 * Allows toggling imports for available methods.
 */

import { useMemo } from 'react';
import type { ParsedInk, InkExternal } from '../parser/inkTypes';

import './ImportsPanel.css';

export interface AvailableMethod {
  name: string;
  params: string[];
  description?: string;
}

export interface ImportsPanelProps {
  /** The parsed ink data */
  parsedInk: ParsedInk | null;
  /** List of available methods from the editor config */
  availableMethods: AvailableMethod[];
  /** Callback when an import is clicked */
  onImportClick?: (name: string, lineNumber: number) => void;
  /** Callback to add an EXTERNAL import */
  onAddImport?: (method: AvailableMethod) => void;
  /** Callback to remove an EXTERNAL import */
  onRemoveImport?: (methodName: string) => void;
}

interface ImportUsage {
  external: InkExternal;
  isKnown: boolean;
  matchingMethod?: AvailableMethod;
  usageCount: number;
}

export function ImportsPanel({
  parsedInk,
  availableMethods,
  onImportClick,
  onAddImport,
  onRemoveImport,
}: ImportsPanelProps) {
  // Analyze imports and their status
  const importUsages = useMemo(() => {
    if (!parsedInk) return [];

    const availableByName = new Map(availableMethods.map(m => [m.name, m]));

    return parsedInk.externals.map(external => {
      const matchingMethod = availableByName.get(external.name);

      // Count usages of this function in the file
      let usageCount = 0;
      for (const knot of parsedInk.knots) {
        // Count usages based on function name pattern
        const bodyContent = knot.bodyContent;
        const regex = new RegExp(`${external.name}\\s*\\(`, 'g');
        const matches = bodyContent.match(regex);
        usageCount += matches?.length ?? 0;
      }

      return {
        external,
        isKnown: !!matchingMethod,
        matchingMethod,
        usageCount,
      } as ImportUsage;
    });
  }, [parsedInk, availableMethods]);

  // Separate known and unknown imports
  const knownImports = importUsages.filter(i => i.isKnown);
  const unknownImports = importUsages.filter(i => !i.isKnown);

  // Find methods that are used but not imported (error)
  const usedButNotImported = useMemo(() => {
    if (!parsedInk) return [];

    const importedNames = new Set(parsedInk.externals.map(e => e.name));
    const availableByName = new Map(availableMethods.map(m => [m.name, m]));
    const usedMethods = new Set<string>();

    // Scan all knots for method calls
    for (const knot of parsedInk.knots) {
      for (const method of availableMethods) {
        const regex = new RegExp(`${method.name}\\s*\\(`, 'g');
        if (regex.test(knot.bodyContent)) {
          usedMethods.add(method.name);
        }
      }
    }

    // Find used methods that are not imported
    return Array.from(usedMethods)
      .filter(name => !importedNames.has(name))
      .map(name => availableByName.get(name)!)
      .filter(Boolean);
  }, [parsedInk, availableMethods]);

  // Find available methods that are NOT imported (for toggle section)
  const notImportedAvailable = useMemo(() => {
    if (!parsedInk) return availableMethods;

    const importedNames = new Set(parsedInk.externals.map(e => e.name));
    return availableMethods.filter(m => !importedNames.has(m.name));
  }, [parsedInk, availableMethods]);

  // Find available methods that ARE imported (for toggle section)
  const importedAvailable = useMemo(() => {
    if (!parsedInk) return [];

    const importedNames = new Set(parsedInk.externals.map(e => e.name));
    return availableMethods.filter(m => importedNames.has(m.name));
  }, [parsedInk, availableMethods]);

  if (!parsedInk) {
    return (
      <div className="imports-panel">
        <div className="imports-panel-header">
          <h3 className="imports-panel-title">Imports</h3>
        </div>
        <div className="imports-panel-empty">
          No file loaded
        </div>
      </div>
    );
  }

  const hasAnyContent = importUsages.length > 0 || usedButNotImported.length > 0 || availableMethods.length > 0;

  if (!hasAnyContent) {
    return (
      <div className="imports-panel">
        <div className="imports-panel-header">
          <h3 className="imports-panel-title">Imports</h3>
        </div>
        <div className="imports-panel-empty">
          No methods available.
          <div className="imports-panel-hint">
            Add methods to <code>methods.conf.json</code> to enable import management.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="imports-panel">
      <div className="imports-panel-header">
        <h3 className="imports-panel-title">Imports</h3>
        <span className="imports-panel-count">{importUsages.length}</span>
      </div>

      <div className="imports-panel-list">
        {/* Missing imports section (used but not imported) */}
        {usedButNotImported.length > 0 && (
          <div className="imports-panel-section">
            <div className="imports-panel-section-header imports-panel-section-error">
              Missing Imports ({usedButNotImported.length})
            </div>
            {usedButNotImported.map(method => (
              <div
                key={`missing-${method.name}`}
                className="imports-panel-item imports-panel-item-error"
              >
                <div className="imports-panel-item-header">
                  <span className="imports-panel-name">{method.name}</span>
                  <div className="imports-panel-badges">
                    <span className="imports-panel-badge imports-panel-badge-error" title="Not imported">
                      !
                    </span>
                    {onAddImport && (
                      <button
                        className="imports-panel-toggle-btn imports-panel-toggle-add"
                        onClick={() => onAddImport(method)}
                        title="Add import"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>
                <div className="imports-panel-params">
                  ({method.params.join(', ')})
                </div>
                {method.description && (
                  <div className="imports-panel-description">{method.description}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Unknown imports section */}
        {unknownImports.length > 0 && (
          <div className="imports-panel-section">
            <div className="imports-panel-section-header imports-panel-section-warning">
              Unknown Methods ({unknownImports.length})
            </div>
            {unknownImports.map(usage => (
              <div
                key={usage.external.name}
                className="imports-panel-item imports-panel-item-warning"
                onClick={() => onImportClick?.(usage.external.name, usage.external.lineNumber)}
              >
                <div className="imports-panel-item-header">
                  <span className="imports-panel-name">{usage.external.name}</span>
                  <div className="imports-panel-badges">
                    <span className="imports-panel-badge imports-panel-badge-warning" title="Unknown method">
                      ?
                    </span>
                    {usage.usageCount > 0 && (
                      <span className="imports-panel-badge imports-panel-badge-usage" title="Usage count">
                        {usage.usageCount}
                      </span>
                    )}
                  </div>
                </div>
                <div className="imports-panel-params">
                  ({usage.external.params.join(', ')})
                </div>
                <div className="imports-panel-line">Line {usage.external.lineNumber}</div>
              </div>
            ))}
          </div>
        )}

        {/* Valid imports section */}
        {knownImports.length > 0 && (
          <div className="imports-panel-section">
            <div className="imports-panel-section-header imports-panel-section-valid">
              Valid Imports ({knownImports.length})
            </div>
            {knownImports.map(usage => (
              <div
                key={usage.external.name}
                className="imports-panel-item imports-panel-item-valid"
              >
                <div className="imports-panel-item-header">
                  <span
                    className="imports-panel-name imports-panel-name-clickable"
                    onClick={() => onImportClick?.(usage.external.name, usage.external.lineNumber)}
                  >
                    {usage.external.name}
                  </span>
                  <div className="imports-panel-badges">
                    {usage.usageCount > 0 && (
                      <span className="imports-panel-badge imports-panel-badge-usage" title="Usage count">
                        {usage.usageCount}
                      </span>
                    )}
                    {onRemoveImport && (
                      <button
                        className="imports-panel-toggle-btn imports-panel-toggle-remove"
                        onClick={() => onRemoveImport(usage.external.name)}
                        title="Remove import"
                      >
                        −
                      </button>
                    )}
                  </div>
                </div>
                <div className="imports-panel-params">
                  ({usage.external.params.join(', ')})
                </div>
                {usage.matchingMethod?.description && (
                  <div className="imports-panel-description">{usage.matchingMethod.description}</div>
                )}
                <div className="imports-panel-line">Line {usage.external.lineNumber}</div>
              </div>
            ))}
          </div>
        )}

        {/* Available methods to import section */}
        {notImportedAvailable.length > 0 && (
          <div className="imports-panel-section">
            <div className="imports-panel-section-header imports-panel-section-available">
              Available to Import ({notImportedAvailable.length})
            </div>
            {notImportedAvailable.map(method => (
              <div
                key={`available-${method.name}`}
                className="imports-panel-item imports-panel-item-available"
              >
                <div className="imports-panel-item-header">
                  <span className="imports-panel-name imports-panel-name-dimmed">{method.name}</span>
                  <div className="imports-panel-badges">
                    {onAddImport && (
                      <button
                        className="imports-panel-toggle-btn imports-panel-toggle-add"
                        onClick={() => onAddImport(method)}
                        title="Add import"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>
                <div className="imports-panel-params imports-panel-params-dimmed">
                  ({method.params.join(', ')})
                </div>
                {method.description && (
                  <div className="imports-panel-description">{method.description}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ImportsPanel;
