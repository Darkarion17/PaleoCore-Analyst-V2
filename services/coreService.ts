import { supabase } from './supabaseClient';
import type { Core, Section, Microfossil, Folder, DataPoint, Taxonomy, EcologicalData, SectionFossilRecord, SampleCore } from '../types';
import type { CoreRow, SectionRow, MicrofossilRow, FolderRow, SectionFossilRecordInJson, CoreLocation, Database, CoreLabAnalysis, FossilTaxonomy, FossilEcology } from '../database.types';


// =================================================================
// DATABASE TO APPLICATION TYPE MAPPERS
// =================================================================

const dbCoreToAppCore = (dbCore: CoreRow): Core => ({
    id: dbCore.id,
    name: dbCore.name,
    location: dbCore.location,
    waterDepth: dbCore.water_depth,
    project: dbCore.project,
    user_id: dbCore.user_id,
    folder_id: dbCore.folder_id ?? undefined,
    createdAt: dbCore.created_at,
});

const appCoreToDbCore = (appCore: Core, userId: string): Database['public']['Tables']['cores']['Insert'] => ({
    id: appCore.id,
    user_id: userId,
    name: appCore.name,
    location: appCore.location,
    water_depth: appCore.waterDepth,
    project: appCore.project,
    folder_id: appCore.folder_id ?? null,
});


const dbSectionToAppSection = (dbSection: SectionRow): Section => ({
    id: dbSection.id,
    core_id: dbSection.core_id,
    name: dbSection.name,
    sectionDepth: dbSection.section_depth,
    sampleInterval: dbSection.sample_interval ?? undefined,
    recoveryDate: dbSection.recovery_date,
    collectionTime: dbSection.collection_time ?? undefined,
    epoch: dbSection.epoch,
    geologicalPeriod: dbSection.geological_period as Section['geologicalPeriod'],
    ageRange: dbSection.age_range,
    dataPoints: ((dbSection.data_points as DataPoint[]) || []).map((dp, index) => ({
        ...dp,
        subsection: dp.subsection || `Subsection ${index + 1}`,
    })),
    microfossilRecords: (dbSection.microfossil_records || []).map(r => ({
        fossilId: r.fossil_id,
        abundance: r.abundance,
        preservation: r.preservation,
        observations: r.observations,
    })),
    labAnalysis: dbSection.lab_analysis as Section['labAnalysis'] ?? undefined,
    summary: dbSection.summary ?? undefined,
    sectionImage: (!dbSection.section_image || dbSection.section_image.includes('placehold.co'))
        ? `data:image/svg+xml,${encodeURIComponent(`<svg width="800" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="100" fill="#1e293b" /><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#94a3b8">${dbSection.name}</text></svg>`)}`
        : dbSection.section_image,
    collector: dbSection.collector ?? undefined,
    lithology: dbSection.lithology ?? undefined,
    munsellColor: dbSection.munsell_color ?? undefined,
    grainSize: dbSection.grain_size ?? undefined,
    tephraLayers: dbSection.tephra_layers ?? undefined,
    paleomagneticReversals: dbSection.paleomagnetic_reversals ?? undefined,
    createdAt: dbSection.created_at,
});

const appSectionToDbPayload = (appSection: Partial<Section>): Database['public']['Tables']['sections']['Update'] => ({
    name: appSection.name,
    section_depth: appSection.sectionDepth,
    sample_interval: appSection.sampleInterval ?? null,
    recovery_date: appSection.recoveryDate,
    collection_time: appSection.collectionTime ?? null,
    epoch: appSection.epoch,
    geological_period: appSection.geologicalPeriod,
    age_range: appSection.ageRange,
    data_points: appSection.dataPoints ?? [],
    microfossil_records: appSection.microfossilRecords?.map(r => ({
        fossil_id: r.fossilId,
        abundance: r.abundance,
        preservation: r.preservation,
        observations: r.observations,
    })) ?? [],
    lab_analysis: (appSection.labAnalysis as CoreLabAnalysis) ?? null,
    summary: appSection.summary ?? null,
    section_image: appSection.sectionImage,
    collector: appSection.collector ?? null,
    lithology: appSection.lithology ?? null,
    munsell_color: appSection.munsellColor ?? null,
    grain_size: appSection.grainSize ?? null,
    tephra_layers: appSection.tephraLayers ?? null,
    paleomagnetic_reversals: appSection.paleomagneticReversals ?? null,
});

const appSectionToDbInsertPayload = (appSection: Omit<Section, 'id' | 'createdAt'>): Database['public']['Tables']['sections']['Insert'] => ({
    core_id: appSection.core_id,
    name: appSection.name,
    section_depth: appSection.sectionDepth,
    sample_interval: appSection.sampleInterval ?? null,
    recovery_date: appSection.recoveryDate,
    collection_time: appSection.collectionTime ?? null,
    epoch: appSection.epoch,
    geological_period: appSection.geologicalPeriod,
    age_range: appSection.ageRange,
    data_points: appSection.dataPoints ?? [],
    microfossil_records: appSection.microfossilRecords?.map(r => ({
        fossil_id: r.fossilId,
        abundance: r.abundance,
        preservation: r.preservation,
        observations: r.observations,
    })) ?? [],
    lab_analysis: (appSection.labAnalysis as CoreLabAnalysis) ?? null,
    summary: appSection.summary ?? null,
    section_image: appSection.sectionImage,
    collector: appSection.collector ?? null,
    lithology: appSection.lithology ?? null,
    munsell_color: appSection.munsellColor ?? null,
    grain_size: appSection.grainSize ?? null,
    tephra_layers: appSection.tephraLayers ?? null,
    paleomagnetic_reversals: appSection.paleomagneticReversals ?? null,
});


const dbFossilToAppFossil = (dbFossil: MicrofossilRow): Microfossil => ({
    id: dbFossil.id,
    taxonomy: dbFossil.taxonomy as Taxonomy || { kingdom: '', phylum: '', class: '', order: '', family: '', genus: 'Unknown', species: 'Fossil' },
    description: dbFossil.description ?? '',
    stratigraphicRange: dbFossil.stratigraphic_range ?? '',
    ecology: dbFossil.ecology as EcologicalData || { temperatureRange: '', depthHabitat: '', notes: '' },
    imageUrl: dbFossil.image_url ?? '',
});

const appFossilToDbFossil = (appFossil: Microfossil): Database['public']['Tables']['microfossils']['Insert'] => ({
    id: appFossil.id,
    taxonomy: appFossil.taxonomy as FossilTaxonomy,
    description: appFossil.description,
    stratigraphic_range: appFossil.stratigraphicRange,
    ecology: appFossil.ecology as FossilEcology,
    image_url: appFossil.imageUrl,
});

const dbFolderToAppFolder = (dbFolder: FolderRow): Folder => ({
    id: dbFolder.id,
    name: dbFolder.name,
    user_id: dbFolder.user_id,
    created_at: dbFolder.created_at,
});


// =================================================================
// SERVICE FUNCTIONS
// =================================================================

export const fetchFoldersAndCores = async (userId: string) => {
    const { data: coreData, error: coreError } = await supabase
        .from('cores').select('*').eq('user_id', userId);
    if (coreError) throw coreError;

    const { data: folderData, error: folderError } = await supabase
        .from('folders').select('*').eq('user_id', userId).order('created_at', { ascending: true });
    if (folderError) throw folderError;

    return {
        cores: (coreData as unknown as CoreRow[] | null)?.map(dbCoreToAppCore) ?? [],
        folders: (folderData as unknown as FolderRow[] | null)?.map(dbFolderToAppFolder) ?? [],
    };
};

export const fetchSectionsForCore = async (coreId: string) => {
    const { data, error } = await supabase.from('sections').select('*').eq('core_id', coreId);
    if (error) throw error;
    return (data as unknown as SectionRow[] | null)?.map(dbSectionToAppSection) ?? [];
};

export const fetchMicrofossils = async () => {
    const { data, error } = await supabase.from('microfossils').select('*');
    if (error) throw error;
    return {
        microfossils: (data as unknown as MicrofossilRow[] | null)?.map(dbFossilToAppFossil) ?? [],
    };
};

export const saveCore = async (coreToSave: Core, userId: string, isEditing: boolean) => {
    const dbCore = appCoreToDbCore(coreToSave, userId);
    let result;

    if (isEditing) {
        const { id, user_id, ...updatePayload } = dbCore;
        result = await supabase.from('cores').update(updatePayload).eq('id', coreToSave.id).select();
    } else {
        const { data: existingCore, error: checkError } = await supabase.from('cores').select('id').eq('id', coreToSave.id).maybeSingle();
        if (checkError) {
            throw new Error(`Error checking for existing core: ${checkError.message}`);
        }
        if (existingCore) {
             throw new Error(`Core with ID "${coreToSave.id}" already exists. Please use a unique ID.`);
        }
        
        result = await supabase.from('cores').insert(dbCore).select();
    }

    const { data, error } = result;
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Failed to save core, no data returned.");
    
    return dbCoreToAppCore(data[0] as unknown as CoreRow);
};

export const saveSection = async (sectionToSave: Section, isEditing: boolean) => {
    let result;

    if (isEditing) {
        const payload = appSectionToDbPayload(sectionToSave);
        result = await supabase.from('sections').update(payload).eq('id', sectionToSave.id).select();
    } else {
        const { id, createdAt, ...insertData } = sectionToSave;
        const insertPayload = appSectionToDbInsertPayload(insertData);
        result = await supabase.from('sections').insert(insertPayload).select();
    }
    const { data, error } = result;
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Failed to save section.");
    return dbSectionToAppSection(data[0] as unknown as SectionRow);
};


export const updateSection = async (sectionToUpdate: Section) => {
    const updateData = appSectionToDbPayload(sectionToUpdate);
    const { data, error } = await supabase.from('sections')
        .update(updateData)
        .eq('id', sectionToUpdate.id)
        .select();
    
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Failed to update section.");

    return dbSectionToAppSection(data[0] as unknown as SectionRow);
};


export const deleteCore = async (coreId: string) => {
    // Cascade delete: first sections, then core
    const { error: sectionError } = await supabase.from('sections').delete().eq('core_id', coreId);
    if (sectionError) throw sectionError;

    const { error: coreError } = await supabase.from('cores').delete().eq('id', coreId);
    if (coreError) throw coreError;
};

export const deleteSection = async (sectionId: string) => {
    const { error } = await supabase.from('sections').delete().eq('id', sectionId);
    if (error) throw error;
};

export const addFossil = async (newFossil: Microfossil) => {
    const dbFossil = appFossilToDbFossil(newFossil);
    const { data, error } = await supabase.from('microfossils').insert(dbFossil).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Failed to add fossil.");
    return dbFossilToAppFossil(data[0] as unknown as MicrofossilRow);
};

export const createFolder = async (folderName: string, userId: string) => {
    const { data, error } = await supabase.from('folders').insert({ name: folderName, user_id: userId }).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Failed to create folder.");
    return dbFolderToAppFolder(data[0] as unknown as FolderRow);
};

export const renameFolder = async (folderId: string, newName: string) => {
    const { data, error } = await supabase.from('folders').update({ name: newName }).eq('id', folderId).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Failed to rename folder.");
    return dbFolderToAppFolder(data[0] as unknown as FolderRow);
};

export const deleteFolder = async (folderId: string) => {
    const { error: updateError } = await supabase.from('cores').update({ folder_id: null }).eq('folder_id', folderId);
    if (updateError) throw updateError;
    
    const { error } = await supabase.from('folders').delete().eq('id', folderId);
    if (error) throw error;
};

export const moveCore = async (coreId: string, folderId: string | null) => {
    const { data, error } = await supabase.from('cores').update({ folder_id: folderId }).eq('id', coreId).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Failed to move core.");
    return dbCoreToAppCore(data[0] as unknown as CoreRow);
};

export const loadSampleData = async (sampleCores: SampleCore[], userId: string) => {
    for (const sampleCore of sampleCores) {
        // 1. Create the parent Core
        const { sections, ...coreData } = sampleCore;
        const dbCore = appCoreToDbCore(coreData as Core, userId);
        
        const { data: createdCoreData, error: coreError } = await supabase.from('cores').insert(dbCore).select().single();
        if (coreError) {
          // If the core already exists, just query for it.
          if (coreError.code === '23505') { // unique constraint violation
            const { data: existingCoreData, error: existingCoreError } = await supabase.from('cores').select().eq('id', dbCore.id).single();
            if (existingCoreError) throw existingCoreError;
            if (!existingCoreData) throw new Error(`Sample core ${dbCore.id} should exist but was not found.`);
            
            const typedExistingCoreData = existingCoreData as unknown as CoreRow;
            await supabase.from('sections').delete().eq('core_id', typedExistingCoreData.id); // Clear old sections
            
            const sectionsToInsert = sections.map(section => {
                const appSection: Omit<Section, 'id' | 'createdAt'> = {
                    ...section,
                    core_id: typedExistingCoreData.id,
                };
                return appSectionToDbInsertPayload(appSection);
            });

            if (sectionsToInsert.length > 0) {
              const { error: sectionError } = await supabase.from('sections').insert(sectionsToInsert);
              if (sectionError) throw sectionError;
            }
            continue; // Move to the next sample core
          }
          throw coreError;
        }

        if (!createdCoreData) throw new Error('Failed to create or find sample core.');
        
        const typedCreatedCoreData = createdCoreData as unknown as CoreRow;
        
        // 2. Create the child Sections for that Core
        const sectionsToInsert = sections.map(section => {
            const appSection: Omit<Section, 'id' | 'createdAt'> = {
                ...section,
                core_id: typedCreatedCoreData.id
            };
            return appSectionToDbInsertPayload(appSection);
        });

        if (sectionsToInsert.length > 0) {
            const { error: sectionError } = await supabase.from('sections').insert(sectionsToInsert);
            if (sectionError) throw sectionError;
        }
    }
};
