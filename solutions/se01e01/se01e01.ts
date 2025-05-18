import express from 'express';
import { PageScrapper } from './PageScrapper';

const app = express();
const port = 3000;
app.use(express.json());
app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/chat requests`));

const questionScrapper = new PageScrapper();


app.post('/api/se01e01/log-in', async (req, res) => {
    console.log('Received request');

    const question = await questionScrapper.findQuestion();
    const answer = await questionScrapper.solveQuestion(question);

    const formData = new FormData();
    formData.append('username', 'tester');
    formData.append('password', process.env.SE01E01_PASSWORD || '');
    formData.append('answer', answer);
    
    const response = await fetch('https://xyz.ag3nts.org', {
        method: 'POST',
        body: formData
    });

    console.log('response:', await response.text());
});


