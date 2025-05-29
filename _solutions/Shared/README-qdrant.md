# Qdrant Database Setup with Docker and TypeScript

This setup provides a simplified Qdrant vector database integration for the project.

## Prerequisites

- Docker Desktop installed and running
- Node.js (v16 or higher)

## Quick Start

1. **Start Qdrant with Docker Compose:**
   ```bash
   docker-compose up -d qdrant
   ```

2. **Use in your code:**
   ```typescript
   import { QdrantService } from './_solutions/Shared/QdrantService';
   
   const qdrant = new QdrantService();
   await qdrant.ensureCollection({
       name: 'documents',
       vectorSize: 1536
   });
   ```

## Files

- `docker-compose.yml` - Includes Qdrant service configuration
- `_solutions/Shared/QdrantService.ts` - Simplified service class
- `_solutions/Shared/qdrant-example.ts` - Usage example

## Simplified API

### QdrantService Methods

- `isRunning()` - Check if Qdrant is accessible
- `collectionExists(name)` - Check if collection exists
- `ensureCollection(config)` - Create collection if it doesn't exist
- `insertPoints(collection, points)` - Insert vector data
- `search(collection, vector, limit)` - Search for similar vectors
- `getCollections()` - List all collections
- `deleteCollection(name)` - Delete a collection

### Basic Usage

```typescript
import { QdrantService } from './_solutions/Shared/QdrantService';

const qdrant = new QdrantService();

// Ensure collection exists
await qdrant.ensureCollection({
    name: 'my_collection',
    vectorSize: 1536,
    distance: 'Cosine'
});

// Insert data
await qdrant.insertPoints('my_collection', [
    {
        id: 1,
        vector: [0.1, 0.2, ...], // Your vector
        payload: { text: "Document content" }
    }
]);

// Search
const results = await qdrant.search('my_collection', searchVector, 10);
```

## Docker Commands

```bash
# Start Qdrant
docker-compose up -d qdrant

# Stop Qdrant
docker-compose down

# View logs
docker-compose logs qdrant
```

## Qdrant Web UI

Access the web interface at: http://localhost:6333/dashboard

## Configuration

Default configuration connects to `localhost:6333`. For custom setup:

```typescript
const qdrant = new QdrantService({
    host: 'localhost',
    port: 6333,
    apiKey: 'your-api-key' // Optional
});
``` 