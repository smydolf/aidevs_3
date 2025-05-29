import { QdrantService } from './QdrantService';

async function debugQdrantSearch() {
    const qdrant = new QdrantService();
    const collectionName = 'se03e02-weapons';

    try {
        console.log('=== Qdrant Debug Information ===');
        
        // 1. Check if Qdrant is running
        const isRunning = await qdrant.isRunning();
        console.log('Qdrant running:', isRunning);
        
        if (!isRunning) {
            console.log('❌ Qdrant is not running. Start with: docker-compose up -d qdrant');
            return;
        }

        // 2. Check if collection exists
        const exists = await qdrant.collectionExists(collectionName);
        console.log('Collection exists:', exists);
        
        if (!exists) {
            console.log('❌ Collection does not exist');
            return;
        }

        // 3. Get collection info
        console.log('\n=== Collection Information ===');
        const collectionInfo = await qdrant.getCollectionInfo(collectionName);
        console.log('Collection status:', collectionInfo.status);
        console.log('Vector size:', collectionInfo.config?.params?.vectors?.size);
        console.log('Distance metric:', collectionInfo.config?.params?.vectors?.distance);
        console.log('Points count:', collectionInfo.points_count);
        console.log('Vectors count:', collectionInfo.vectors_count);

        // 4. Check for data in collection
        console.log('\n=== Data Check ===');
        const hasData = await qdrant.hasData(collectionName);
        console.log('Collection has data:', hasData);
        
        const pointCount = await qdrant.countPoints(collectionName);
        console.log('Exact point count:', pointCount);

        if (pointCount > 0) {
            console.log('\n=== Sample Data ===');
            const samplePoints = await qdrant.getSamplePoints(collectionName, 3);
            console.log('Sample points count:', samplePoints.length);
            
            samplePoints.forEach((point, index) => {
                console.log(`Point ${index + 1}:`);
                console.log('  ID:', point.id);
                console.log('  Payload keys:', Object.keys(point.payload || {}));
                if (point.payload) {
                    console.log('  Payload sample:', JSON.stringify(point.payload, null, 2).slice(0, 200) + '...');
                }
            });

            // Get all point IDs
            const allIds = await qdrant.getAllPointIds(collectionName);
            console.log('\nAll point IDs:', allIds.slice(0, 10)); // Show first 10
            if (allIds.length > 10) {
                console.log(`... and ${allIds.length - 10} more`);
            }
        } else {
            console.log('❌ Collection is empty - no points to search');
            console.log('You need to insert data before searching');
            return;
        }

        // 5. Test with a simple vector
        const vectorSize = collectionInfo.config?.params?.vectors?.size || 1536;
        console.log('\n=== Testing Search ===');
        console.log('Creating test vector of size:', vectorSize);
        
        const testVector = Array.from(new Array(vectorSize), () => Math.random());
        console.log('Test vector sample:', testVector.slice(0, 5));
        console.log('Test vector length:', testVector.length);
        
        // Validate vector
        const hasInvalidValues = testVector.some(v => !isFinite(v) || v === null || v === undefined);
        console.log('Vector has invalid values:', hasInvalidValues);
        
        if (hasInvalidValues) {
            console.log('❌ Vector contains invalid values');
            return;
        }

        // 6. Attempt search
        console.log('\nAttempting search...');
        const results = await qdrant.search(collectionName, testVector, 5);
        console.log('✅ Search successful!');
        console.log('Results count:', results.length);
        
        if (results.length > 0) {
            console.log('First result score:', results[0].score);
            console.log('First result payload keys:', Object.keys(results[0].payload || {}));
        }

    } catch (error: any) {
        console.error('\n❌ Error occurred:');
        console.error('Message:', error.message);
        console.error('Status:', error.status);
        
        if (error.data) {
            console.error('Error details:', JSON.stringify(error.data, null, 2));
        }
    }
}

// Run if called directly
if (require.main === module) {
    debugQdrantSearch();
}

export { debugQdrantSearch }; 