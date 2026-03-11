# Aarogya Nigrani - Backend

Welcome to the backend repository of **Aarogya Nigrani**! This project handles all the core API functionalities, database interactions, and business logic for the Aarogya Nigrani health dashboard.

## 🚀 Features

- **Robust RESTful API**: Structured and scalable endpoints to interact with the frontend smoothly.
- **Data Security & Validation**: Ensures data integrity with proper validation rules.
- **High Performance**: Optimized routing and middleware structure for fast response times.
- **Scalable Architecture**: Easily extendable to integrate new services or expand current functionality.

## 🛠 Prerequisites

Make sure you have the following installed on your local machine:
- Node.js (v18 or higher recommended)
- npm or yarn (package manager)

## 📦 Installation

To get the backend server up and running locally, follow these steps:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/manikkDev/aarogya-nigrani-backend.git
   ```

2. **Navigate to the project directory:**
   ```bash
   cd aarogya-nigrani-backend
   ```

3. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install
   ```

4. **Environment Variables:**
   Create a `.env` file in the root directory and configure the necessary environment variables! (e.g., PORT, Database configurations).

## 💻 Running the Server

To start the local development server, run:

```bash
npm run dev
# or
yarn dev
```

The server will typically run on `http://localhost:5000` or the port specified in your `.env` file.

## 📁 Project Structure

- `/src/routes`: Contains all the API route handlers.
- `/src/controllers`: Business logic and processing functions.
- `/src/models`: Database schemas and models.
- `/src/middlewares`: Custom middleware functions (auth, error handling, etc.).

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page. 

## 📄 License

This project is licensed under the MIT License.
