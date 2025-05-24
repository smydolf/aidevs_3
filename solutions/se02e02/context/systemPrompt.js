const prompt = `
[TASK]
Your task is to determine from which city the provided map fragments originate.

[INSTRUCTIONS]

Carefully analyze each map fragment.

Identify the names of streets, characteristic landmarks (such as cemeteries, churches, schools), and the urban layout visible in the fragments.

Use these features to help pinpoint the city.

[IMPORTANT NOTES]

There are 4 fragments of the map.
The maps are divided into 4 parts by solid white lines.
Be aware that one of the map fragments is incorrect and comes from a different city than the others.

As you analyze, try to identify if any fragment does not match the general pattern or characteristics of the other fragments. Mark this fragment as a potential error.

Make sure that the locations you recognize on the map are indeed located in the city you intend to provide as your answer.

NEVER return the city of Krakow, Warsaw, Poznan, Białystok, Lublin, Łódź, Gdańsk, Wrocław, Rzeszów, Toruń, Bydgoszcz, Szczecin, Częstochowa, Radom, Kielce.

[OUTPUT]

Clearly state the name of the city from which the majority of the map fragments originate. You can give more than one city if you think it's a good idea.

If you identify a fragment that appears to be from a different city, briefly note which fragment it is and why you suspect it is an error.
`;

export default async function () {
    return {
        "role": "system",
        "content": prompt,
    }
}

const describeMapPrompt = `
[TASK]
Your task is to describe the map fragments in a way that can be used to identify the city. Describe it as a text as detailed as possible.

[INSTRUCTIONS]

Describe the map fragments in a way that can be used to identify the city. Describe it as a text as detailed as possible.
Examine every detail of the map fragments.
Check the names of the streets, characteristic landmarks (such as cemeteries, churches, schools), and the urban layout visible in the fragments.
Describe how objects are placed on the map, how they are connected to each other.
Describe the city's layout, how the streets are connected to each other.
Describe the city's landmarks, how they are connected to each other.
Describe the city's streets, how they are connected to each other.
Describe the city's buildings, how they are connected to each other.
Describe the city's parks, how they are connected to each other.
Describe the city's rivers, how they are connected to each other.
Describe the intersection of the streets, how they are connected to each other.

[IMPORTANT NOTES]

There are 4 fragments of the map.
The maps are divided into 4 parts by solid white lines.
Be aware that one of the map fragments is incorrect and comes from a different city than the others.

As you analyze, try to identify if any fragment does not match the general pattern or characteristics of the other fragments. Mark this fragment as a potential error.

Make sure that the locations you recognize on the map are indeed located in the city you intend to provide as your answer.

[OUTPUT]

The most accurate description of the map fragments that can be used to identify the city.

`;

export async function describeDefinitionPrompt() {
    return {
        "role": "system",
        "content": describeMapPrompt,
    }
}