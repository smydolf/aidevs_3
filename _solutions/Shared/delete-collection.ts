import { QdrantService } from './QdrantService';

async function deleteCollection() {
    const qdrant = new QdrantService();
    const collectionName = 'se03e02-weapons';

    try {
        console.log(`Checking if collection '${collectionName}' exists...`);

        const exists = await qdrant.collectionExists(collectionName);
        if (!exists) {
            console.log(`❌ Collection '${collectionName}' does not exist`);
            return;
        }

        console.log(`✅ Collection '${collectionName}' exists`);

        // Get info before deletion
        const info = await qdrant.getCollectionInfo(collectionName);
        console.log(`Collection has ${info.points_count} points`);

        console.log(`Deleting collection '${collectionName}'...`);
        await qdrant.deleteCollection(collectionName);

        console.log(`✅ Collection '${collectionName}' deleted successfully`);

        // Verify deletion
        const stillExists = await qdrant.collectionExists(collectionName);
        if (!stillExists) {
            console.log(`✅ Confirmed: Collection '${collectionName}' no longer exists`);
        } else {
            console.log(`❌ Warning: Collection '${collectionName}' still exists`);
        }

    } catch (error: any) {
        console.error('❌ Error deleting collection:');
        console.error('Message:', error.message);
        console.error('Status:', error.status);
        if (error.data) {
            console.error('Details:', JSON.stringify(error.data, null, 2));
        }
    }
}

// Run if called directly
if (require.main === module) {
    deleteCollection();
}

export { deleteCollection }; 