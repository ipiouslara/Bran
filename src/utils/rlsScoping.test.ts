// Test suite for PM scoping and RLS query filtering logic

interface ProjectRecord {
  id: string;
  name: string;
  ownerId: string;
}

interface EmployeeProjectLink {
  employeeId: string;
  projectId: string;
}

function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, but got ${actual}. ${message || ''}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Simulated PM RLS filter function matching PostgreSQL policy pm_has_project_access
export function filterProjectsForPM(
  pmId: string,
  userRole: 'Admin' | 'Project Manager' | 'Lead' | 'Employee',
  allProjects: ProjectRecord[],
  projectLinks: EmployeeProjectLink[]
): ProjectRecord[] {
  if (userRole === 'Admin') {
    return allProjects;
  }

  return allProjects.filter(project => {
    // 1. Direct owner check
    if (project.ownerId === pmId) return true;

    // 2. Direct project link check
    const hasLink = projectLinks.some(
      link => link.projectId === project.id && link.employeeId === pmId
    );
    if (hasLink) return true;

    return false;
  });
}

export function runRlsScopingTests() {
  const pmA = 'pm-uuid-1111';
  const pmB = 'pm-uuid-2222';
  const adminId = 'admin-uuid-0000';

  const mockProjects: ProjectRecord[] = [
    { id: 'proj-1', name: 'Alpha Project', ownerId: pmA },
    { id: 'proj-2', name: 'Beta Project', ownerId: pmA },
    { id: 'proj-3', name: 'Gamma Project (PM B Only)', ownerId: pmB },
    { id: 'proj-4', name: 'Delta Project (PM B Only)', ownerId: pmB },
  ];

  const mockLinks: EmployeeProjectLink[] = [
    { employeeId: pmA, projectId: 'proj-3' } // PM A assigned as team member on Proj 3
  ];

  // Test 1: Admin receives all projects
  const adminResult = filterProjectsForPM(adminId, 'Admin', mockProjects, mockLinks);
  assertEquals(adminResult.length, 4, 'Admin receives all projects');

  // Test 2: PM A fetches only owned projects + linked projects
  const pmAResult = filterProjectsForPM(pmA, 'Project Manager', mockProjects, mockLinks);
  const pmAResultIds = pmAResult.map(p => p.id);
  assert(pmAResultIds.includes('proj-1'), 'PM A gets owned proj-1');
  assert(pmAResultIds.includes('proj-2'), 'PM A gets owned proj-2');
  assert(pmAResultIds.includes('proj-3'), 'PM A gets linked proj-3');
  assert(!pmAResultIds.includes('proj-4'), 'PM A cannot get un-scoped proj-4');

  // Test 3: PM B attempting to fetch project outside scope receives empty result
  const unScopedQueryProjects = mockProjects.filter(p => p.id === 'proj-1'); // proj-1 owned by PM A
  const pmBResult = filterProjectsForPM(pmB, 'Project Manager', unScopedQueryProjects, []);
  assertEquals(pmBResult.length, 0, 'PM B gets empty response for project outside scope');

  console.log('✅ All RLS PM scoping tests passed successfully.');
}

// Execute tests if invoked directly
runRlsScopingTests();
