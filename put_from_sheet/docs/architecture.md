# Architecture & Directory Structure

This project follows a Clean Architecture-like structure.

## Directory Structure (`src/`)

| Directory | Responsibility |
| :--- | :--- |
| `config/` | Configuration constants (API endpoints, Sheet names, etc.) |
| `domain/` | Domain entities and business rules (e.g., `Item` model) |
| `infrastructure/` | Interface with external systems (REST API client, etc.) |
| `presentation/` | Entry points and UI (GAS Triggers, Menus, HTML Modals) |
| `storage/` | Data access layer (Google Sheets repositories) |
| `usecase/` | Application business logic (Orchestration) |
| `types/` | Shared type definitions |
| `utils/` | General utility functions |

## Components

- **Domain**: Defines the `Item` entity (JAN, Name, etc.).
- **Storage**: Reads data from the "filtered_items" sheet.
- **Infrastructure**: Sends HTTP PUT requests.
- **UseCase**: Coordinates reading data and sending requests.
- **Presentation**: Provides the user interface (Menu) to trigger the process.
