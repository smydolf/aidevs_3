import express from 'express';
import { LangfuseService } from '../Shared/LangfuseService';
import { OpenAIService } from '../Shared/OpenAIService';
import type OpenAI from 'openai';

const app = express();
app.use(express.json());

const port = 3000;
const langfuseService = new LangfuseService();
const openaiService = new OpenAIService();

interface DatabaseSchemaResponse {
    reply: DatabaseSchema[]
}

interface DatabaseSchema {
    table: string;
    createTable: string;
}

interface SqlQueryResponse {
    reply: SqlQueryValue[]
}

interface SqlQueryValue {
    DC_ID: number;
}

app.listen(port, () => console.log(`Server running at http://localhost:${port}. Listening for POST /api/se03e03/sql-query requests`));

app.post('/api/se03e03/sql-query', async (req, res) => {
    const fetchDatabaseSchemas = async () => {
        const userSchema = await fetch('https://c3ntrala.ag3nts.org/apidb', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                task: 'database',
                apikey: process.env.PERSONAL_API_KEY,
                query: 'SHOW CREATE TABLE users'
            })
        });

        const userSchemaResponse = await userSchema.json() as DatabaseSchemaResponse;

        const dataCenterSchemaResponse = await fetch('https://c3ntrala.ag3nts.org/apidb', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                task: 'database',
                apikey: process.env.PERSONAL_API_KEY,
                query: 'SHOW CREATE TABLE datacenters'
            })
        });

        const dataCenterSchema = await dataCenterSchemaResponse.json() as DatabaseSchemaResponse;

        return { userSchema: userSchemaResponse?.reply[0].createTable, dataCenterSchema: dataCenterSchema?.reply[0].createTable };
    }

    const sendDataToHeadquarter = async (answer: number[]) => {
        const report = {
            task: 'database',
            apikey: process.env.PERSONAL_API_KEY,
            answer: answer,
        }

        const response = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(report)
        });

        return await response.text();
    }

    const generateSqlQuery = async (userSchema: string, dataCenterSchema: string) => {
        const sqlQuery = await openaiService.completion([
            {
                role: "system", content:
                    "You are a SQL query generator and you generate SQL queries based on the schemas provided by the user. " +
                    "You can only generate SQL queries that are valid for SQL database. " +
                    "NEVER generate any other text than the SQL query. The expected output is only the SQL query, nothing else. " +
                    "The response should be in the following format: " +
                    "Select <column_name> from <table_name> where <condition>;" +
                    "Never wrap response in ```sql or ``` or any other text. The response should be only the SQL query." +
                    "ALWAYS check if properties in your sql query are valid for the schemas provided by the user."
            },
            {
                role: "user", content: `Based on schemas below generate SQL query that will return DC_ID from datacenters table for users that are inactive from table users.
                           Notice that column manager in datacenters table is a foreign key to id column in users table. Use is_active column in users table to check if user is active.
                           Schemas:
                           Users table schema:
                           ${userSchema}
                           Datacenters table schema:
                           ${dataCenterSchema}`
            }], "gpt-4o-mini", false, false) as OpenAI.Chat.Completions.ChatCompletion;;

        console.log(`SQL query: ${sqlQuery.choices[0].message.content}`);
        return sqlQuery.choices[0].message.content;
    }

    const makeSqlQueryToApi = async (sqlQuery: string) => {
        const apiResponse = await fetch('https://c3ntrala.ag3nts.org/apidb', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                task: 'database',
                apikey: process.env.PERSONAL_API_KEY,
                query: sqlQuery
            })
        });

        return await apiResponse.json() as SqlQueryResponse;
    }

    console.log('Received request');
    const trace = langfuseService.createTrace({ id: `se03e03-${Date.now()}`, name: 'se03e03-sql-query', sessionId: 'se03e03-sql-query' });

    const { userSchema, dataCenterSchema } = await fetchDatabaseSchemas();
    const sqlQuery = await generateSqlQuery(userSchema, dataCenterSchema);

    if (sqlQuery) {
        const apiResponse = await makeSqlQueryToApi(sqlQuery);
        console.log(apiResponse);
        const sqlQueryResponse = await sendDataToHeadquarter(apiResponse.reply.map(item => item.DC_ID));
        res.status(200).send({ message: sqlQueryResponse });
    }
    else {
        console.log('No SQL query generated');
        res.status(500).send({ message: 'No SQL query generated' });
    }
});