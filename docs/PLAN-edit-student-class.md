# PLAN - Edit Class Name & Student Details with Code Uniqueness

## Overview
This plan outlines the design and implementation for adding editing capabilities for class names and student rosters in the teacher settings dashboard, including backend persistence, websocket propagation, and database-level code uniqueness validations.

---

## Project Type
WEB (Go Fiber + React Vite TypeScript)

---

## Success Criteria
- Teachers can edit a class name directly on the Settings page.
- Renaming a class propagates the name change real-time to active socket sessions.
- Teachers can edit student names and PINs. PIN codes must be validated (exactly 6 characters).
- Form edits reuse the add student card to conserve screen space.
- Class code generation is validated against database entries to guarantee uniqueness.

---

## Proposed Changes

### Backend (Go)

#### 1. Class Code Generation Validation
- File: [state.go](file:///var/www/classroom-bringgas/classroom/state.go)
- Modify `CreateSession` to check if a generated code exists in the MariaDB `classes` table synchronously before using it.

#### 2. PUT Class Name Endpoint
- File: [main.go](file:///var/www/classroom-bringgas/main.go)
- Create `PUT /api/teacher/classes/:code` route to update `class_name` in DB and active session state.

#### 3. PUT Student Endpoint
- File: [routes.go](file:///var/www/classroom-bringgas/routes.go)
- Create `PUT /api/teacher/classes/:code/students/:id` route to update name and PIN. Validate PIN to exactly 6 characters.

### Frontend (React)

#### 1. Store Update
- File: [classStore.ts](file:///var/www/classroom-bringgas/frontend/src/store/classStore.ts)
- Add `editClass` action to update the class name.

#### 2. UI View Updates
- File: [ClassSettingsView.tsx](file:///var/www/classroom-bringgas/frontend/src/components/classroom/ClassSettingsView.tsx)
- Integrate Class Name Inline Editing with pencil icon.
- Integrate Student Editing within the "Add Student" card by switching modes dynamically using a pencil icon in the Roster table.

---

## Verification Plan

### Automated Tests
- Build verification:
  - `go build -o classroom-bringgas .`
  - In `frontend/`: `npm run build`

### Manual Verification
1. **Rename Class**: Click rename icon next to the header, change name, save. Reload to verify persistence. Verify active student screen updates.
2. **Edit Student**: Click edit on a student row. Verify fields populate card. Change name and PIN, hit save. Ensure list updates. Try duplicate PIN, verify error.
3. **Cancel Edit**: Click cancel when editing student/class. Verify UI reverts.

## ✅ PHASE X COMPLETE
- Lint: ✅ Pass
- Security: ✅ No critical issues
- Build: ✅ Success
- Date: 2026-06-13

