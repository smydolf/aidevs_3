import { QdrantService } from './QdrantService';

async function example() {
    // Initialize Qdrant service
    const qdrant = new QdrantService();

    try {
        // Check if Qdrant is running
        const isRunning = await qdrant.isRunning();
        if (!isRunning) {
            console.log('Qdrant is not running. Please start it with: docker-compose up -d');
            return;
        }

        // Ensure collection exists
        await qdrant.ensureCollection({
            name: 'documents',
            vectorSize: 1536, // OpenAI embedding size
            distance: 'Cosine'
        });

        // Insert sample data
        const points = [
            {
                id: 1,
                vector: Array.from({ length: 1536 }, () => Math.random()),
                payload: { text: "Sample document 1", category: "example" }
            },
            {
                id: 2,
                vector: Array.from({ length: 1536 }, () => Math.random()),
                payload: { text: "Sample document 2", category: "example" }
            }
        ];

        await qdrant.insertPoints('documents', points);
        console.log('Inserted sample data');

        // Search
        const searchVector = Array.from({ length: 1536 }, () => Math.random());
        const results = await qdrant.search('documents', searchVector, 5);
        
        console.log('Search results:', results.length);
        results.forEach((result, i) => {
            console.log(`${i + 1}. Score: ${result.score}, Text: ${result.payload?.text}`);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

// Run if called directly
if (require.main === module) {
    example();
}

export { example }; 