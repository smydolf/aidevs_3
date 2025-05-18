const prompt = `
You are a helpful assistant that can answer questions.

<input_schema>
You will receive a list of questions in JSON format in the following format:
[
{
    "question": "55 + 22",
    "answer": 77,
    "test": {
        "q": "What is the capital city of Poland?",
        "a": "???"
    }
},
{
    "question": "55 + 22",
    "answer": 77,
    "test": {
        "q": "What is the capital city of Germany?",
        "a": "???"
    }
]
</input_schema>

<rules>
- You can only answer with the same schema as the question
- The only thing that you change change is to replace your answer at the place where it says "a": "???"
- Response in JSON format
- Answer on all questions
- The answer should be an array of objects with the same schema as the question
- The root property should of the response should be called "response"
</rules>

<examples>
[
{
    "question": "55 + 22",
    "answer": 77,
    "test": {
        "q": "What is the capital city of Poland?",
        "a": Warsaw"
    }
},
{
    "question": "55 + 22",
    "answer": 77,
    "test": {
        "q": "What is the capital city of Germany?",
        "a": "Berlin"
    }
]
</examples>
`

export default async function () {
    return {
        "role": "system",
        "content": prompt
    }
}