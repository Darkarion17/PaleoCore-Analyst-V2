import { GoogleGenAI, GenerateContentResponse, Type, Content } from "@google/genai";
import type { Section, DataPoint, Microfossil, PartialMicrofossil, Taxonomy, EcologicalData, TiePoint, PaleoEvent } from '../types';
import { COMMON_DATA_KEYS } from "../constants";

// Se inicializa 'ai' de manera laxa para poder manejar el caso de que la clave no esté configurada
let ai: GoogleGenAI | null = null;
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Función para inicializar el objeto de IA solo si la clave existe
const initializeGeminiClient = () => {
    if (!API_KEY) {
        console.error("API_KEY environment variable not set. AI features will be disabled.");
        return null;
    }
    return new GoogleGenAI({ apiKey: API_KEY });
};

// Se llama a la función de inicialización.
// Esto permite que el resto del código funcione aunque la API key no esté presente.
ai = initializeGeminiClient();

const formatSectionDataForChat = (section: Section): string => {
    let dataSummary = 'No data points provided for this section.';
    if (section.dataPoints && section.dataPoints.length > 0) {
        const headers = Object.keys(section.dataPoints[0]);
        const samplePoints = section.dataPoints.slice(0, 5);
        dataSummary = `The section has a data series of ${section.dataPoints.length} points with columns: ${headers.join(', ')}.`;
    }

    return `
      Section Data:
      - Core ID: ${section.core_id}, Section Name: ${section.name}
      - Depth: ${section.sectionDepth} cmbsf
      - Age/Epoch: ${section.ageRange}, ${section.epoch}, ${section.geologicalPeriod} period
      - ${dataSummary}
    `;
};

export const getAnalysisFromAIStream = async (section: Section, query: string): Promise<AsyncGenerator<GenerateContentResponse>> => {
    if (!ai) {
        throw new Error("Error: API key is not configured. Please contact the administrator.");
    }
    
    const model = 'gemini-2.5-flash';
    const systemInstruction = `You are a world-class paleoceanographer. Analyze the provided sediment section data to answer the user's question. Be concise, scientific, and refer to specific data points or trends where possible. If the user asks for recent information or studies, use your search tool.`;

    const sectionContext = formatSectionDataForChat(section);
    const finalPrompt = `${sectionContext}\n\nUser Question: "${query}"`;
    
    const searchKeywords = ['search', 'find studies', 'what is new on', 'latest research', 'recent articles'];
    const useSearch = searchKeywords.some(keyword => query.toLowerCase().includes(keyword));

    const contents: Content[] = [{ role: 'user', parts: [{ text: finalPrompt }] }];

    return ai.models.generateContentStream({
        model: model,
        contents: contents,
        config: {
            systemInstruction: systemInstruction,
            temperature: 0.5,
            ...(useSearch && { tools: [{ googleSearch: {} }] })
        },
    });
};


export const generateSectionSummary = async (section: Section, microfossils: Microfossil[]): Promise<string> => {
    if (!ai) {
        return "Error: API key is not configured.";
    }
    
    const model = 'gemini-2.5-flash';
    const systemInstruction = `You are a paleoceanography expert. Your task is to provide a concise, integrated scientific summary of a sediment section. Focus on key findings, trends, and potential climatic implications suggested by the combined datasets. If data for a section is missing or sparse, note that. Structure your response with a brief overview followed by key bullet points.`;

    // Sanitize and summarize data for the prompt
    const dataForPrompt = {
        metadata: {
            coreId: section.core_id,
            sectionName: section.name,
            ageRange: section.ageRange,
            epoch: section.epoch,
            geologicalPeriod: section.geologicalPeriod,
        },
        labAnalysis: section.labAnalysis,
        fossilRecords: section.microfossilRecords.map(r => {
            const fossil = microfossils.find(f => f.id === r.fossilId);
            return {
                species: fossil ? `${fossil.taxonomy.genus} ${fossil.taxonomy.species}` : r.fossilId,
                abundance: r.abundance,
                preservation: r.preservation,
                observations: r.observations,
            };
        }),
        dataSeriesSummary: section.dataPoints.length > 0 ? {
            rowCount: section.dataPoints.length,
            columns: Object.keys(section.dataPoints[0] || {}),
            samplePoints: section.dataPoints.slice(0, 3)
        } : "Not provided"
    };

    const prompt = `Please generate a scientific summary for the following sediment section data:
    ${JSON.stringify(dataForPrompt, (key, value) => (value === null || value === '' || (Array.isArray(value) && value.length === 0)) ? undefined : value, 2)}
    `;

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
            },
        });
        // Remove markdown-like characters (* and #) from the AI's response.
        const cleanedSummary = response.text.replace(/[*#]/g, '');
        return cleanedSummary;
    } catch (error) {
        console.error("Gemini Summary Error:", error);
        return `AI Summary Error: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`;
    }
};

export const mapCsvHeaders = async (headers: string[]): Promise<Record<string, string | null>> => {
    if (!ai) throw new Error("API key is not configured.");
    
    const model = 'gemini-2.5-flash';
    const knownKeys = Object.keys(COMMON_DATA_KEYS);
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            mapping: {
                type: Type.OBJECT,
                properties: headers.reduce((acc, header) => {
                    acc[header] = { type: Type.STRING, description: `The mapped key for '${header}'. Should be one of [${knownKeys.join(', ')}] or null.` };
                    return acc;
                }, {} as Record<string, any>)
            }
        },
        required: ['mapping']
    };

    const prompt = `
      You are an expert data processor for paleoceanography. Your task is to map CSV headers to a standard set of keys.
      
      Here are the standard keys:
      ${knownKeys.join(', ')}

      Here are the headers from the user's CSV file:
      ${headers.join(', ')}

      Please provide a mapping for each header. If a header clearly corresponds to one of the standard keys, provide that key. If a header does not match any standard key or is ambiguous, map it to null.
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
            },
        });
        const jsonResponse = JSON.parse(response.text);
        return jsonResponse.mapping;
    } catch (error) {
        console.error("Gemini Header Mapping Error:", error);
        // Fallback to a null mapping on error
        return headers.reduce((acc, header) => ({...acc, [header]: null }), {});
    }
};

export const identifyFossilFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    if (!ai) return "Error: API key is not configured.";

    const model = 'gemini-2.5-flash';
    const imagePart = {
        inlineData: {
            data: base64Image,
            mimeType: mimeType,
        },
    };
    const textPart = {
        text: `You are a micropaleontologist. Please identify the microfossil in this image. Provide a probable identification, describe its key morphological features, and mention its typical paleoecological significance. Format your response clearly with the following headings:
### Identification
### Morphological Description
### Paleoecological Significance`,
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [imagePart, textPart] },
        });
        return response.text;
    } catch (error) {
        console.error("Gemini Image Analysis Error:", error);
        return `AI Analysis Error: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`;
    }
};

// Helper to parse the AI's markdown response from image analysis
export const parseFossilAnalysis = (analysisText: string): PartialMicrofossil => {
    const parsedData: PartialMicrofossil & { taxonomy: Partial<Taxonomy>, ecology: Partial<EcologicalData> } = {
        taxonomy: {} as Partial<Taxonomy>,
        ecology: {} as Partial<EcologicalData>,
        description: '',
    };

    const sections: Record<string, string> = {};
    const lines = analysisText.split('\n');
    let currentSection: string | null = null;
    
    for (const line of lines) {
        const match = line.match(/^###\s+(.*)/);
        if (match) {
            currentSection = match[1].trim().toLowerCase();
            sections[currentSection] = '';
        } else if (currentSection && line.trim()) {
            sections[currentSection] += `${line.trim().replace(/^-|^\*/, '').trim()} `;
        }
    }
    
    // Extract Identification (Genus and species)
    if (sections['identification']) {
        const idText = sections['identification'].trim();
        // Assuming format "Genus species" or "G. species"
        const nameParts = idText.split(/\s+/);
        if (nameParts.length >= 2) {
            parsedData.taxonomy.genus = nameParts[0];
            parsedData.taxonomy.species = nameParts[1];
        } else {
            parsedData.taxonomy.genus = idText;
        }
    }
    
    // Extract Description
    if (sections['morphological description']) {
        parsedData.description = sections['morphological description'].trim();
    }
    
    // Extract Ecology
    if (sections['paleoecological significance']) {
        parsedData.ecology.notes = sections['paleoecological significance'].trim();
    }

    return parsedData as PartialMicrofossil;
};


export const generateAgeModel = async (sections: Section[], tiePoints: TiePoint[]): Promise<Section[]> => {
    if (!ai) throw new Error("API key is not configured.");

    const model = 'gemini-2.5-flash';
    const systemInstruction = `You are a highly skilled paleoceanographic data scientist specializing in age-depth modeling. Your task is to create a robust age model for a set of sediment sections.
    You will be given sections containing data points (with depth and potentially climate proxies like d18O) and a list of stratigraphic tie-points (age control points).
    
    Your instructions are:
    1. Establish an initial age-depth relationship using the provided tie-points for each section.
    2. Crucially, if a key climate proxy (like delta18O) is present in the data, do not just perform simple linear interpolation. Instead, analyze the trends in the proxy data between the tie-points. Adjust the calculated ages to reflect known paleoclimatic patterns. For example, intervals with condensed proxy values may represent slower sedimentation, and expanded sections may represent faster sedimentation.
    3. Your goal is to create a more realistic age model than simple linear interpolation by incorporating evidence from the sediment data itself.
    4. Perform linear interpolation/extrapolation only if no useful proxy data is available or for depths outside the tie-point range.
    5. If a section has fewer than two tie-points, you cannot calculate an age model. In this case, return the section but with no 'age' property in its data points.
    6. Return ONLY a JSON object that strictly follows the provided JSON schema. The JSON object will contain a root property 'sections'. This property will be an array of all the sections you processed.
    7. For each section in the returned array, you must include its original 'id' and 'name'. The 'dataPoints' array for each section must contain objects with the original 'depth' and the new calculated 'age'.
    
    Do not add any properties other than 'depth' and 'age' to the data point objects in your response. Ensure your output is a single, valid JSON object.`;

    // Find a primary proxy to use for tuning the age model
    const proxyPriority = ['delta18O', 'temperature', 'calculatedSST', 'alkenoneSST', 'tex86'];
    let primaryProxy: string | null = null;
    if (sections.length > 0 && sections[0].dataPoints.length > 0) {
        const firstPointKeys = Object.keys(sections[0].dataPoints[0]);
        for (const proxy of proxyPriority) {
            if (firstPointKeys.includes(proxy)) {
                primaryProxy = proxy;
                break;
            }
        }
    }

    const promptData = {
        sections: sections.map(s => ({
            id: s.id,
            name: s.name,
            dataPoints: s.dataPoints.map(dp => {
                const point: { depth?: number, [key: string]: any } = { depth: dp.depth };
                if (primaryProxy && dp[primaryProxy] !== undefined) {
                    point[primaryProxy] = dp[primaryProxy];
                }
                return point;
            })
        })),
        tiePoints: tiePoints.map(tp => ({
            sectionId: tp.sectionId,
            depth: tp.depth,
            age: tp.age,
        })),
        ...(primaryProxy && { analysisHint: `Use the '${primaryProxy}' proxy data to refine the age model between tie-points.` })
    };

    const prompt = `Here is the data: ${JSON.stringify(promptData, null, 2)}`;

    const dataPointSchema = {
        type: Type.OBJECT,
        properties: {
            depth: { type: Type.NUMBER },
            age: { type: Type.NUMBER, nullable: true }
        },
        required: ['depth'],
    };

    const sectionSchema = {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            dataPoints: {
                type: Type.ARRAY,
                items: dataPointSchema,
            },
        },
        required: ['id', 'name', 'dataPoints'],
    };

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            sections: {
                type: Type.ARRAY,
                items: sectionSchema,
            },
        },
        required: ['sections'],
    };
    
    try {
        const result = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.1, // Lower temperature for more deterministic JSON output
            },
        });

        const jsonResponse = JSON.parse(result.text);
        const calibratedSectionsFromAI = jsonResponse.sections || (Array.isArray(jsonResponse) ? jsonResponse : []);
        
        if (!Array.isArray(calibratedSectionsFromAI) || calibratedSectionsFromAI.length === 0) {
            throw new Error("The AI response for the age model was empty or invalid.");
        }
        
        const hasAnyAgeData = calibratedSectionsFromAI.some(
            (cs: any) => cs.dataPoints && Array.isArray(cs.dataPoints) && cs.dataPoints.some((dp: any) => dp.age !== undefined && dp.age !== null)
        );

        if (!hasAnyAgeData) {
            throw new Error("AI failed to calculate age data. This can happen if fewer than two tie-points are provided for a section. Please check your inputs.");
        }


        const finalSections = sections.map(originalSection => {
            const calibratedData = calibratedSectionsFromAI.find((cs: any) => cs.id === originalSection.id);
            
            if (calibratedData && Array.isArray(calibratedData.dataPoints)) {
                const ageMap = new Map(
                    calibratedData.dataPoints
                        .filter((dp: any) => dp.depth !== undefined && dp.age !== undefined && dp.age !== null)
                        .map((dp: any) => [dp.depth, dp.age])
                );

                if (ageMap.size === 0) {
                    return originalSection;
                }

                const updatedDataPoints = originalSection.dataPoints.map(dp => {
                    if (dp.depth === undefined) return dp;
                    const calculatedAge = ageMap.get(dp.depth);
                    
                    return {
                        ...dp,
                        age: (calculatedAge !== undefined) ? parseFloat(Number(calculatedAge).toFixed(4)) : dp.age,
                    };
                });
                return { ...originalSection, dataPoints: updatedDataPoints };
            }
            return originalSection;
        });

        return finalSections;

    } catch (error) {
        console.error("Gemini Age Model Error:", error);
        throw new Error(`AI Age Model Error: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`);
    }
};

export const detectPaleoEvents = async (dataPoints: DataPoint[]): Promise<PaleoEvent[]> => {
    if (!ai) throw new Error("API key is not configured.");
    
    const model = 'gemini-2.5-flash';
    const systemInstruction = `You are a paleoclimatology expert. Your task is to analyze a given time series data (age in thousands of years 'ka' vs. a proxy value) and identify significant named paleo-events. These could include Heinrich Stadials, Dansgaard-Oeschger events, Bond events, the Younger Dryas, Bølling-Allerød, etc. For each event, provide its name, its start and end age in ka, and a brief scientific description of its significance. Only identify events that are reasonably supported by the data trends.`;

    const pointsWithAge = dataPoints.filter(dp => dp.age !== undefined && dp.age !== null);
    
    if (pointsWithAge.length < 5) {
        // Not enough data to make a meaningful analysis
        return [];
    }

    // Identify the most likely climate proxy to analyze
    const proxyPriority = ['delta18O', 'temperature', 'calculatedSST', 'alkenoneSST', 'tex86'];
    let primaryProxy = 'age'; // Fallback
    for (const proxy of proxyPriority) {
        if (pointsWithAge[0][proxy] !== undefined) {
            primaryProxy = proxy;
            break;
        }
    }
    // If no priority proxy found, take the first available key that is not age/depth/subsection
    if (primaryProxy === 'age') {
        const firstPointKeys = Object.keys(pointsWithAge[0]);
        primaryProxy = firstPointKeys.find(k => k !== 'age' && k !== 'depth' && k !== 'subsection') || 'value';
    }


    const promptData = pointsWithAge.map(p => ({ age: p.age, value: p[primaryProxy] }));

    const prompt = `
        Analyze the following paleoclimate data, where 'age' is in ka (thousands of years ago) and 'value' represents the proxy ${primaryProxy}. Identify significant paleo-events.
        Data:
        ${JSON.stringify(promptData.slice(0, 500))}
    `; // Limit data points sent to avoid overly large prompts

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                eventName: { type: Type.STRING, description: 'The scientific name of the event.' },
                startAge: { type: Type.NUMBER, description: 'The starting age of the event in ka.' },
                endAge: { type: Type.NUMBER, description: 'The ending age of the event in ka.' },
                description: { type: Type.STRING, description: 'A brief scientific description of the event and its significance.' }
            },
            required: ['eventName', 'startAge', 'endAge', 'description']
        }
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: 0.3,
            },
        });

        const jsonResponse = JSON.parse(response.text);
        // Ensure startAge is always less than endAge
        return jsonResponse.map((event: PaleoEvent) => ({
            ...event,
            startAge: Math.min(event.startAge, event.endAge),
            endAge: Math.max(event.startAge, event.endAge),
        }));
    } catch (error) {
        console.error("Gemini Paleo-Event Detection Error:", error);
        throw new Error(`AI Event Detection Error: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`);
    }
};
