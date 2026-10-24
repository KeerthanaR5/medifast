# MediFast

### Full-Stack Pharmacy and Medicine Availability Platform

MediFast is a MERN-stack web application designed to help patients search for medicines and discover nearby pharmacies. It provides role-based experiences for patients, pharmacy owners, and administrators, with inventory management and controlled medicine reservation workflows.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React.js, JavaScript, HTML, CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Authentication | JWT, bcrypt |
| Location Services | Geolocation and OpenStreetMap/Overpass integration |
| Testing | Jest |
| Version Control | Git and GitHub |

## Key Features

### Patient
- Account registration and login
- Medicine search
- Nearby pharmacy discovery
- Medicine availability and pricing information
- Pharmacy details
- Reservation workflows for eligible verified pharmacies

### Pharmacy Owner
- Role-based login
- Pharmacy profile dashboard
- Medicine inventory management
- Stock quantities and unit prices
- Reservation history and management interfaces

### Administrator
- Administrator authentication
- Pharmacy approval and rejection workflows
- Pharmacy verification controls

### Demo Safety
- Demo pharmacies are explicitly identified
- Simulated inventory is distinguished from verified availability
- Reservations are restricted to eligible verified pharmacies
- Development demonstration data is separated from production data

## Getting Started

### Prerequisites
- Node.js and npm
- MongoDB Atlas connection
- Git

### Clone the Repository

```bash
git clone -b medifast-college-demo https://github.com/KeerthanaR5/medifast.git
cd medifast
```

### Install Dependencies

```bash
npm install --prefix backend
npm install --prefix frontend
```

### Environment Configuration

Create a `backend/.env` file containing the required configuration:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
CLIENT_URL=http://localhost:3000
```

These are placeholders. Never commit actual credentials or `.env` files.

### Start the Backend

```bash
cd backend
node server.js
```

Backend API: http://localhost:5000/api

### Start the Frontend

Open another terminal from the project root:

```bash
npm --prefix frontend start
```

Frontend: http://localhost:3000

## Testing

Run backend automated tests:

```bash
npm --prefix backend test
```

Build the React frontend:

```bash
npm --prefix frontend run build
```

### Latest Local Verification

- Backend automated tests: 82/82 passed
- Frontend production build: Successful
- Patient, pharmacy owner, and administrator login: Verified
- Medicine search and nearby pharmacy results: Verified
- Pharmacy inventory display: Verified
- Demo pharmacy reservation safeguards: Tested

## Project Structure

- `backend/` — Express API, models, controllers, routes, scripts, and tests
- `frontend/` — React application
- `README.md` — Main project documentation

## Current Limitations

- Demo inventory does not represent verified real-world medicine availability.
- Email delivery requires additional configuration and verification.
- Historical reservation display requires further investigation.
- Live deployment and production security checks require separate validation.

## Repository

GitHub: https://github.com/KeerthanaR5/medifast

College demo branch: `medifast-college-demo`

## Project Purpose

MediFast is an academic full-stack development project demonstrating MERN technologies, REST APIs, authentication, location-based pharmacy discovery, medicine inventory management, and role-based workflows.
