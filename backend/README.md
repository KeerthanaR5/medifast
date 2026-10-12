# MediFast — Pharmacy & Medicine Availability Platform

MediFast is a full-stack web application designed to help users discover pharmacies, search for medicines, check medicine availability, and manage medicine reservations through a centralized platform.

The application provides role-based functionality for customers, pharmacy owners, and administrators.

## Key Features

### Customer
- User registration and authentication
- Search for medicines and pharmacies
- Discover nearby pharmacies using location-based functionality
- View pharmacy and medicine information
- Create and track medicine reservations

### Pharmacy Owner
- Pharmacy registration and management
- Manage medicine stock and availability
- Bulk stock upload using CSV files
- View and manage pharmacy-related reservations

### Administrator
- Manage pharmacy approval workflows
- Access administrative pharmacy and stock management features
- Manage platform-related operations

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React.js, JavaScript, HTML5, CSS3, Axios |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Authentication | JWT-based authentication and role-based authorization |
| Mapping | Location-based pharmacy discovery and mapping services |
| Version Control | Git and GitHub |

## Project Structure

```text
medifast/
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── jobs/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── scripts/
│   ├── services/
│   ├── tests/
│   └── server.js
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── pages/
│       └── services/
├── package.json
├── package-lock.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js and npm
- MongoDB Atlas or a MongoDB database
- Git

### Installation

1. Clone the repository.

```bash
git clone https://github.com/KeerthanaR5/medifast.git
cd medifast
```

2. Install dependencies.

```bash
npm install
```

3. Configure backend environment variables.

Create `backend/.env` with the required configuration, including your MongoDB connection URI and JWT secrets. Additional configuration may be needed for mapping, email, and other integrations.

Never commit actual credentials or `.env` files to GitHub.

4. Start the backend.

```bash
npm run start:backend
```

5. In another terminal, start the frontend.

```bash
npm run start:frontend
```

The frontend runs locally at `http://localhost:3000` by default, and the backend uses port `5000` unless configured otherwise.

## API and Application Architecture

MediFast uses a React frontend that communicates with an Express REST API. The backend handles authentication, pharmacy management, medicine searches, stock management, and reservations, with MongoDB used for data persistence.

## Deployment

Cloud deployment is in progress. Production links will be added after successful deployment.

## Future Enhancements

- Improved medicine search and discovery
- Enhanced pharmacy inventory analytics
- Expanded reservation notifications
- Deployment monitoring and performance improvements

## Author

**Keerthana R**

GitHub: https://github.com/KeerthanaR5

## Project Status

Actively developed and being prepared for cloud deployment.