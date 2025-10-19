# Ward Calling Management System

A comprehensive web application for managing ward callings, tracking calling changes, and organizing the calling workflow.

## Features

- **Org Chart**: Visual representation of ward organization with all callings and current assignments
- **Calling Changes Workflow**: Track calling transitions from consideration through completion
  - Add multiple candidates for consideration
  - Select member for prayer
  - Track status (hold, in progress, completed)
  - Manage cascading effects of calling changes
- **Member Directory**: Complete ward member list with contact information
- **Task Management**: Track all tasks related to calling changes
  - Release current member
  - Extend calling to new member
  - Sustain in sacrament meeting
  - Set apart
  - Record in tools

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- TailwindCSS for styling
- React Router for navigation
- TanStack Query (React Query) for data fetching
- Axios for API calls

### Backend
- Node.js with Express
- TypeScript
- PostgreSQL database
- RESTful API architecture

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## Installation

### 1. Clone the repository
```bash
cd /Users/jarombrown/PycharmProjects/church/callings
```

### 2. Install server dependencies
```bash
cd server
npm install
```

### 3. Install client dependencies
```bash
cd ../client
npm install
```

### 4. Set up PostgreSQL database

Create a new PostgreSQL database:
```bash
createdb ward_callings
```

Or using PostgreSQL CLI:
```sql
CREATE DATABASE ward_callings;
```

### 5. Configure environment variables

Create a `.env` file in the `server` directory:
```bash
cd ../server
cp .env.example .env
```

Edit `.env` with your database credentials:
```
PORT=3001
DATABASE_URL=postgresql://username:password@localhost:5432/ward_callings
NODE_ENV=development
```

### 6. Run database migrations

Execute the SQL migration file:
```bash
psql -d ward_callings -f ../database/001_initial_schema.sql
```

Or using the PostgreSQL connection:
```bash
psql ward_callings < ../database/001_initial_schema.sql
```

## Running the Application

### Development Mode

You'll need two terminal windows:

**Terminal 1 - Backend Server:**
```bash
cd server
npm run dev
```
The API will run on http://localhost:3001

**Terminal 2 - Frontend:**
```bash
cd client
npm run dev
```
The app will run on http://localhost:3000

### Production Build

**Build the backend:**
```bash
cd server
npm run build
npm start
```

**Build the frontend:**
```bash
cd client
npm run build
npm run preview
```

## Database Schema

The application uses the following main tables:

- **members**: Ward member information
- **households**: Family household data
- **organizations**: Ward organizations (EQ, RS, Primary, etc.)
- **callings**: Calling positions within organizations
- **calling_assignments**: Current calling assignments
- **calling_changes**: Workflow for calling transitions
- **calling_considerations**: People being considered for callings
- **member_calling_needs**: Members who need callings
- **tasks**: Workflow tasks for calling changes
- **bishopric_stewardships**: Organization assignments to bishopric

## API Endpoints

### Members
- `GET /api/members` - Get all members
- `GET /api/members/:id` - Get member by ID
- `GET /api/members/needs/callings` - Get members needing callings
- `POST /api/members` - Create new member
- `PUT /api/members/:id` - Update member

### Callings
- `GET /api/callings` - Get all callings with assignments
- `GET /api/callings/:id` - Get calling by ID
- `POST /api/callings` - Create new calling
- `PUT /api/callings/:id` - Update calling

### Calling Changes
- `GET /api/calling-changes` - Get all calling changes
- `GET /api/calling-changes/:id` - Get calling change by ID
- `POST /api/calling-changes` - Create new calling change
- `PUT /api/calling-changes/:id` - Update calling change
- `POST /api/calling-changes/:id/considerations` - Add consideration
- `DELETE /api/calling-changes/:id/considerations/:considerationId` - Remove consideration
- `PUT /api/calling-changes/:id/considerations/:considerationId/select` - Select for prayer

### Organizations
- `GET /api/organizations` - Get all organizations
- `POST /api/organizations` - Create organization

### Tasks
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `POST /api/tasks/:id/complete` - Mark task complete

## Data Import

To import your existing ward data, you can:

1. Use the Church API (from your frisco5th-lcr project)
2. Import from CSV files
3. Manually enter through the UI

We can create import scripts once you have your ward directory ready.

## Future Enhancements

- Interactive org chart with drag-and-drop
- Cascading effect visualization
- Member household modal view
- Photo management
- Reporting and analytics
- Church API integration for automatic data sync
- Authentication and authorization
- Multi-user support with role-based access

## License

Private use only
