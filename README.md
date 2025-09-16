
# VeilPix - AI-Powered Image Editor

VeilPix is a modern, web-based image editing application that leverages the power of Google's Gemini AI to provide a seamless and intuitive photo editing experience. Users can perform complex generative edits with simple text prompts, apply global filters, make fine-tuned adjustments, and combine multiple images into creative composites.

## Features

-   **AI-Powered Localized Edits**: Click on any part of an image and use a text prompt to describe your desired change (e.g., "change shirt color to red").
-   **Generative Adjustments**: Use natural language to apply global changes to lighting and color (e.g., "make the image warmer").
-   **Creative Filters**: Apply a variety of artistic filters to transform the look and feel of your photos.
-   **Multi-Image Composition**: Combine two images with a text prompt to create unique composites.
-   **Standard Editing Tools**: Includes essential tools like cropping with aspect ratio control.
-   **Unlimited History**: Undo and redo edits with a complete version history.
-   **Webcam Support**: Capture photos directly from your webcam to start editing immediately.

## Technologies Used

| Category          | Technology                                                                   |
| ----------------- | ---------------------------------------------------------------------------- |
| **Frontend**      | React 19, TypeScript, Vite, Tailwind CSS                                     |
| **Backend**       | Node.js, Express                                                             |
| **AI Service**    | Google Gemini (`gemini-2.5-flash-image-preview`)                               |
| **Authentication**| Clerk                                                                        |
| **Database**      | Supabase (PostgreSQL)                                                        |
| **Payments**      | Stripe                                                                       |
| **State Management**| React Hooks                                                                  |

## Getting Started

This project is a monorepo containing the frontend React application and the backend Node.js API (`veilpix-api`).

### Prerequisites

-   Node.js (v18 or later recommended)
-   `npm`

### 1. Frontend Setup

1.  **Navigate to the root directory and install dependencies:**
    ```bash
    npm install
    ```

2.  **Create an environment file:**
    Create a file named `.env.local` in the project root.

3.  **Add environment variables:**
    You need to add your Clerk publishable key and the URL for the backend API.
    ```env
    # Clerk Publishable Key (Required)
    VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key

    # API Base URL (Required)
    # Use http://127.0.0.1:3001 for local development
    VITE_API_BASE_URL=http://127.0.0.1:3001
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The frontend will be available at `http://127.0.0.1:5173`.

### 2. Backend Setup (`veilpix-api`)

1.  **Navigate to the API directory and install dependencies:**
    ```bash
    cd veilpix-api
    npm install
    ```

2.  **Create an environment file:**
    Create a file named `.env` in the `veilpix-api` directory.

3.  **Add environment variables:**
    The backend requires keys for Gemini, Clerk, Supabase, and Stripe.
    ```env
    NODE_ENV=development
    PORT=3001
    GEMINI_API_KEY=your_gemini_api_key
    CLERK_SECRET_KEY=your_clerk_secret_key
    SUPABASE_URL=your_supabase_project_url
    SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
    STRIPE_SECRET_KEY=your_stripe_secret_key
    STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
    ```

4.  **Run the development server:**
    ```bash
    # Uses nodemon for auto-reloading
    npm run dev
    ```
    The backend API will be running on `http://127.0.0.1:3001`.

**Note for WSL Users:** It is critical to use `127.0.0.1` instead of `localhost` for both the frontend and backend URLs to ensure proper communication between the two services.


