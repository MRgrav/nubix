# Examination Management API Documentation

## Overview
The Examination Management system allows schools to create and manage examinations, track student results, and generate examination statistics.

## Models

### Examination
- `id`: Unique identifier (auto-increment)
- `title`: Examination title
- `description`: Optional description
- `subject`: Subject being examined
- `examDate`: Date and time of examination
- `duration`: Duration in minutes
- `totalMarks`: Total marks for the examination
- `status`: Examination status (SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED)
- `schoolId`: School ID (required)
- `classroomId`: Classroom ID (required)
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp
- `results`: Related ExaminationResult records

### ExaminationResult
- `id`: Unique identifier (auto-increment)
- `marksObtained`: Marks obtained by the student
- `remarks`: Optional remarks/feedback
- `examinationId`: Examination ID (required)
- `studentId`: Student ID (required)
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp
- Unique constraint: One result per student per examination

## API Endpoints

### Examination Management

#### Create Examination
```
POST /api/examinations
Authorization: Bearer <token>
Role Required: ADMIN, STAFF

Request Body:
{
  "title": "Mathematics Mid-Term",
  "description": "Mid-term examination for Mathematics",
  "subject": "Mathematics",
  "examDate": "2025-11-15T10:00:00Z",
  "duration": 120,
  "totalMarks": 100,
  "schoolId": 1,
  "classroomId": 1
}

Response: 201 Created
{
  "id": 1,
  "title": "Mathematics Mid-Term",
  "description": "Mid-term examination for Mathematics",
  "subject": "Mathematics",
  "examDate": "2025-11-15T10:00:00Z",
  "duration": 120,
  "totalMarks": 100,
  "status": "SCHEDULED",
  "schoolId": 1,
  "classroomId": 1,
  "createdAt": "2025-11-11T08:43:56Z",
  "updatedAt": "2025-11-11T08:43:56Z",
  "school": { "id": 1, "name": "School Name", "schoolCode": "SC01" },
  "classroom": { "id": 1, "name": "Class 10-A" }
}
```

#### Get All Examinations
```
GET /api/examinations?schoolId=1&classroomId=1&status=SCHEDULED
Authorization: Bearer <token>
Role Required: ADMIN, STAFF

Query Parameters:
- schoolId: Filter by school (optional)
- classroomId: Filter by classroom (optional)
- status: Filter by status (optional)

Response: 200 OK
{
  "examinations": [
    { /* examination object */ }
  ]
}
```

#### Get Single Examination
```
GET /api/examinations/:id
Authorization: Bearer <token>
Role Required: ADMIN, STAFF, STUDENT

Response: 200 OK
{
  "id": 1,
  "title": "Mathematics Mid-Term",
  ...
  "results": [
    {
      "id": 1,
      "studentId": 5,
      "marksObtained": 85,
      "student": { "id": 5, "name": "John Doe", "email": "john@school.com" }
    }
  ]
}
```

#### Update Examination
```
PUT /api/examinations/:id
Authorization: Bearer <token>
Role Required: ADMIN, STAFF

Request Body (all fields optional):
{
  "title": "Mathematics Mid-Term Revised",
  "status": "IN_PROGRESS",
  "totalMarks": 100
}

Response: 200 OK
{ /* updated examination object */ }
```

#### Delete Examination
```
DELETE /api/examinations/:id
Authorization: Bearer <token>
Role Required: ADMIN, STAFF

Response: 200 OK
{ "message": "Examination deleted successfully" }
```

### Examination Results

#### Add/Update Examination Result
```
POST /api/examinations/results/add
Authorization: Bearer <token>
Role Required: ADMIN, STAFF

Request Body:
{
  "examinationId": 1,
  "studentId": 5,
  "marksObtained": 85,
  "remarks": "Good performance"
}

Response: 201 Created
{
  "id": 1,
  "marksObtained": 85,
  "remarks": "Good performance",
  "examinationId": 1,
  "studentId": 5,
  "student": { "id": 5, "name": "John Doe", "email": "john@school.com" },
  "examination": { "id": 1, "title": "Mathematics Mid-Term", "totalMarks": 100 }
}
```

#### Get Student Examination Results
```
GET /api/examinations/student/:studentId?examinationId=1
Authorization: Bearer <token>
Role Required: ADMIN, STAFF, STUDENT

Query Parameters:
- examinationId: Filter by specific examination (optional)

Response: 200 OK
{
  "results": [
    {
      "id": 1,
      "marksObtained": 85,
      "remarks": "Good performance",
      "examination": {
        "id": 1,
        "title": "Mathematics Mid-Term",
        "subject": "Mathematics",
        "examDate": "2025-11-15T10:00:00Z",
        "totalMarks": 100
      }
    }
  ]
}
```

#### Get Examination Result Details
```
GET /api/examinations/result/:resultId
Authorization: Bearer <token>
Role Required: ADMIN, STAFF, STUDENT

Response: 200 OK
{
  "id": 1,
  "marksObtained": 85,
  "remarks": "Good performance",
  "student": {
    "id": 5,
    "name": "John Doe",
    "email": "john@school.com",
    "classroom": { "id": 1, "name": "Class 10-A" }
  },
  "examination": {
    "id": 1,
    "title": "Mathematics Mid-Term",
    "subject": "Mathematics",
    "examDate": "2025-11-15T10:00:00Z",
    "totalMarks": 100
  }
}
```

#### Delete Examination Result
```
DELETE /api/examinations/result/:resultId
Authorization: Bearer <token>
Role Required: ADMIN, STAFF

Response: 200 OK
{ "message": "Examination result deleted successfully" }
```

### Statistics

#### Get Examination Statistics
```
GET /api/examinations/:examinationId/stats
Authorization: Bearer <token>
Role Required: ADMIN, STAFF

Response: 200 OK
{
  "totalStudents": 30,
  "averageMarks": 72.50,
  "highestMarks": 98,
  "lowestMarks": 45,
  "passedCount": 28
}
```

## Status Codes

- `200 OK`: Successful GET, PUT request
- `201 Created`: Successful POST request
- `400 Bad Request`: Missing or invalid required fields
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## Authentication & Authorization

All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

Authorization levels:
- `ADMIN`: Full access to all examination operations
- `STAFF`: Can create, view, and modify examinations and results
- `STUDENT`: Can only view examinations and their own results

## Usage Examples

### Example 1: Create and Manage an Examination

```bash
# Create examination
curl -X POST http://localhost:5000/api/examinations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Science Final Exam",
    "subject": "Science",
    "examDate": "2025-12-20T14:00:00Z",
    "duration": 180,
    "totalMarks": 100,
    "schoolId": 1,
    "classroomId": 1
  }'

# Add student result
curl -X POST http://localhost:5000/api/examinations/results/add \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "examinationId": 1,
    "studentId": 5,
    "marksObtained": 88,
    "remarks": "Excellent work"
  }'

# Get examination statistics
curl -X GET http://localhost:5000/api/examinations/1/stats \
  -H "Authorization: Bearer <token>"
```

### Example 2: View Student Results

```bash
# Get all results for a student
curl -X GET http://localhost:5000/api/examinations/student/5 \
  -H "Authorization: Bearer <token>"

# Get specific result
curl -X GET http://localhost:5000/api/examinations/result/1 \
  -H "Authorization: Bearer <token>"
```

## Notes

- Examination results are cascaded deleted when an examination is deleted
- Each student can have only one result per examination (unique constraint)
- Pass marks are calculated as 50% of total marks
- All dates are in ISO 8601 format (UTC)
