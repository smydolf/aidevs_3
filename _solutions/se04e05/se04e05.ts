import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { LangfuseService } from '../Shared/LangfuseService';
import pdf2pic from 'pdf2pic';
import pdf from 'pdf-parse';
import { OpenAIService } from '../Shared/OpenAIService';
import type OpenAI from 'openai';

const app = express();

const langfuseService = new LangfuseService();
const openaiService = new OpenAIService();

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});

app.post('/api/se04e05/rafcio', async (req, res) => {
    const trace = langfuseService.createTrace({ id: `se04e05-${Date.now()}`, name: 'se04e05-rafal', sessionId: 'se04e05-rafal' });

    const getNotes = async () => {
        console.log('Getting notes');
        if (await fs.exists(path.join(__dirname, 'notes.pdf'))) {
            console.log('Notes already exist');
            return await fs.readFile(path.join(__dirname, 'notes.pdf'));
        }

        const notes = await fetch('https://c3ntrala.ag3nts.org/dane/notatnik-rafala.pdf');
        const notesBuffer = await notes.arrayBuffer();
        await fs.writeFile(path.join(__dirname, 'notes.pdf'), Buffer.from(notesBuffer));
        return Buffer.from(notesBuffer);
    }

    const processPdf = async (notes: Buffer) => {
        try {
            console.log('Processing PDF...');

            // Extract text from pages 1-18
            const pdfData = await pdf(notes);
            console.log(`Total pages in PDF: ${pdfData.numpages}`);

            // For pdf-parse, we need to process the entire document as it doesn't support page-by-page extraction natively
            // We'll extract all text and then try to split by pages or use a different approach
            const allText = pdfData.text;
            console.log('Extracted text from pages 1-18 (first 500 chars):', allText.substring(0, 500));

            // Save text from pages 1-18
            await fs.writeFile(path.join(__dirname, 'processedNotes', 'pages_1_18.txt'), allText);

            // Extract page 19 as image using pdf2pic
            const convert = pdf2pic.fromBuffer(notes, {
                density: 100,
                saveFilename: "page_19",
                savePath: path.join(__dirname, 'processedNotes'),
                format: "png",
                width: 600,
                height: 800
            });

            // Ensure directory exists
            await fs.mkdir(path.join(__dirname, 'processedNotes'), { recursive: true });

            // Convert page 19
            console.log('Converting page 19 to image...');
            await convert(19);

            // Read the created image file and convert to base64
            const imagePath = path.join(__dirname, 'processedNotes', 'page_19.19.png');
            const imageBuffer = await fs.readFile(imagePath);
            const imageBase64 = imageBuffer.toString('base64');

            // send image to openai
            const response = await openaiService.completion(
                [
                    {
                        role: 'system',
                        content: `You are a helpful assistant that can extract text from images. 
                        Extract only text from the image, do not include any other text.`
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Extract text from the image' },
                            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
                        ]
                    }
                ]
            ) as OpenAI.Chat.Completions.ChatCompletion;

            const text = response.choices[0].message.content;

            await fs.writeFile(path.join(__dirname, 'processedNotes', 'page_19.txt'), text ?? '');

            return {
                textPages: allText,
                imagePage: imageBase64
            };

        } catch (error) {
            console.error('Error processing PDF:', error);
            throw error;
        }
    }

    const combineText = async () => {
        const page19Text = await fs.readFile(path.join(__dirname, 'processedNotes', 'page_19.txt'), 'utf8');
        const pages118Text = await fs.readFile(path.join(__dirname, 'processedNotes', 'pages_1_18.txt'), 'utf8');
        const combinedText = `${pages118Text}\n\n${page19Text}`;
        await fs.writeFile(path.join(__dirname, 'processedNotes', 'combined.txt'), combinedText);
    }

    // await combineText();


    const sendDataToHeadquarter = async (answer: Record<string, string>) => {
        const report = {
            task: 'notes',
            apikey: process.env.PERSONAL_API_KEY,
            answer: answer,
        }

        console.log(answer);

        const response = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(report)
        });

        return await response.json();
    }

    const askQuestion = async (hints: string[] = []) => {
        // load questions.json
        const questions = await fs.readFile(path.join(__dirname, 'questions.json'), 'utf8');
        const questionsArray = JSON.parse(questions) as Record<string, string>;

        //load combined.txt
        const combinedText = await fs.readFile(path.join(__dirname, 'processedNotes', 'combined.txt'), 'utf8');

        // ask question to openai
        const response = await openaiService.completion(
            [
                {
                    role: 'system',
                    content: `You are a helpful assistant that can answer questions based on the text.
                    You need to answer the question based on the text.
                    Return only the answer, nothing else.
                    Use to most concise answer possible.
                    Return answers separated by new line.
                    Do not return questions, only answers.
                    Pitfalls in Questions:
Question 01: The answer is not explicitly stated. The LLM must infer the correct answer based on the content of the PDF.
Question 03: Pay attention to the small, gray text bene ath one of the figures in the notebook. It is easily overlooked during extraction/OCR. The LLM will recognize its relevance once it is added to the context.
Question 04: The date is given relatively. The LLM must calculate the exact date using data from the PDF. The answer must be in the YYYY-MM-DD format. For sure it is not 2024-11-11.
Question 05: This question refers to page 19. OCR often misinterprets the town name here. Inform the LLM that the text originates from OCR and may contain errors. The town is located near a city closely tied to AIDevs' history. As mentioned earlier, the name might be split into two fragments in the image.
There are hints in the history that can help you answer the question.

                    History:
                    ${hints.join('\n')}
                    `
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Answer the question based on the text' },
                        { type: 'text', text: Object.values(questionsArray).join('\n') },
                        { type: 'text', text: combinedText }
                    ]
                }
            ],
            'gpt-4.1',
        ) as OpenAI.Chat.Completions.ChatCompletion;

        const answer = response.choices[0].message.content ?? '';
        console.log(answer);

        const answerObject = answer.split('\n').filter(line => line.trim() !== '').reduce((acc, curr, index) => {
            acc[`0${index + 1}`] = curr;
            return acc;
        }, {} as Record<string, string>);

        return answerObject;
    }

    const hints: string[] = [];
    let response: { code: number, hint: string, message: string } = { code: 0, hint: '', message: '' };
    do {
        const answer = await askQuestion(hints);
        response = await sendDataToHeadquarter(answer) as { code: number, hint: string, message: string };
        hints.push(`${response.message}\n${response.hint}`);
        console.log(hints);
    } while (response.code !== 200);

    res.json({ message: response });

});