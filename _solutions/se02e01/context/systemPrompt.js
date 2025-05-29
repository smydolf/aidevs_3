const prompt = `
[TASK]
Determine the exact street where the specific institute of a university is located—the institute where Professor Andrzej Maj teaches. Note: You are looking for the street address of the institute itself, not the main campus or university headquarters.

[INSTRUCTIONS]

[EXPECTED OUTPUT RULES]
ONLY the name of the street where the institute is located—nothing more, nothing less.

EXAMPLE:
ul. Jana Długosza
ul. Mackiewicza

[STEP 1: ANALYSIS]
Carefully read through the transcript, thinking out loud and documenting your reasoning at each step. Identify any clues or direct mentions of the institute’s name, its location, or related context that can help pinpoint the street address.

[STEP 2: KNOWLEDGE CROSS-REFERENCE]
Use your internal knowledge about this specific university and its institutes to supplement the information from the transcript.

[STEP 3: CONCLUSION]
Based on the transcript and your knowledge, determine the name of the street where the institute is located.

[IMPORTANT]
At the end, return only the name of the street—do not include any explanations, reasoning, or additional text. Output the street name only.

[REMINDER]
The goal is to find the street address of the institute where Professor Andrzej Maj works—not the general address of the university.

[TIPS]
- Focus on making your analysis clear and precise.
- You must analyze the transcripts and also use your internal knowledge about universities and their institutes.
- Be aware that one of the recordings is more chaotic and may be harder to interpret. Some recordings may be misleading—take this into account in your analysis.
`;

export default async function () {
    return {
        "role": "system",
        "content": prompt,
    }
}