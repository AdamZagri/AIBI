// clean_and_reload_guidelines.mjs - ניקוי וטעינה מחדש של הנחיות
import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';
import { getGuidelines, deleteGuideline, createGuideline, createQueryExample, getBusinessModules } from './guidelines_api.mjs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// הגדרת קבצים וסיווגים
const FILE_MAPPING = {
  'important_enhanced.txt': {
    type: 'chat',
    description: 'הנחיות מכירות וחוקי עסק לצ\'אט',
    category: 'system',
    module_code: 'sales',
    tags: ['chat', 'sales', 'business_rules']
  },
  'IMPORTANT_CTI.txt': {
    type: 'chat', 
    description: 'הנחיות מערכת CTI לצ\'אט',
    category: 'system',
    module_code: 'production',
    tags: ['chat', 'cti', 'production']
  },
  'important_insights.txt': {
    type: 'insights',
    description: 'הנחיות מיוחדות לריצת תובנות',
    category: 'system',
    module_code: 'insights',
    tags: ['insights', 'deep_analysis', 'exploration']
  }
};

async function cleanAllGuidelines() {
  console.log('🧹 Cleaning all existing guidelines...');
  
  const existingResult = await getGuidelines();
  if (!existingResult.success) {
    throw new Error('Failed to get existing guidelines');
  }
  
  const existingGuidelines = existingResult.data;
  console.log(`   Found ${existingGuidelines.length} existing guidelines`);
  
  for (const guideline of existingGuidelines) {
    await deleteGuideline(guideline.id);
  }
  
  console.log('✅ All guidelines cleaned');
}

async function analyzeFileWithAI(content, filename, fileConfig) {
  console.log(`🤖 Analyzing ${filename} with AI...`);
  
  const analysisPrompt = `
נתח את הקובץ הבא וחלק אותו להנחיות מובנות:

**קובץ**: ${filename}
**סוג**: ${fileConfig.type} 
**תיאור**: ${fileConfig.description}

**הוראות**:
1. חלק את התוכן להנחיות נפרדות וברורות
2. זהה דוגמאות SQL (שאילתות עם SELECT/FROM/WHERE)
3. קטלג לפי סוג:
   - technical: כללי SQL, syntax, ביצועים
   - business: חוקי עסק, חישובים, תהליכים
   - data_structure: מבנה טבלאות, עמודות, קשרים
   - workflow: תהליכי עבודה, הנחיות כלליות

**פורמט JSON**:
{
  "guidelines": [
    {
      "title": "כותרת קצרה וברורה",
      "content": "תוכן מלא של ההנחיה",
      "subcategory": "technical|business|data_structure|workflow",
      "module_code": "sales|production|finance|inventory|general",
      "priority": 1|2|3,
      "is_sql_example": false,
      "tags": ["tag1", "tag2"]
    }
  ],
  "sql_examples": [
    {
      "title": "שאלה עסקית",
      "sql_content": "SELECT query...",
      "explanation": "הסבר על השאילתה",
      "module_code": "sales|production|finance|inventory|general",
      "difficulty": "basic|intermediate|advanced"
    }
  ]
}

**תוכן לניתוח**:
${content}
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'אתה מומחה לניתוח הנחיות טכניות ועסקיות. נתח בצורה מדויקת ומסודרת.'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.2,
      max_tokens: 8000
    });

    const aiResponse = response.choices[0].message.content;
    
    // קצת המתנה כדי לא לעבור על rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // חילוץ JSON
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          guidelines: parsed.guidelines || [],
          sql_examples: parsed.sql_examples || []
        };
      } catch (parseError) {
        console.log(`     ❌ JSON parse error, using fallback`);
        return createFallbackStructure(content, filename, fileConfig);
      }
    } else {
      console.log('   ⚠️ AI response not JSON, using fallback');
      return createFallbackStructure(content, filename, fileConfig);
    }
    
  } catch (error) {
    console.error(`   ❌ AI analysis failed: ${error.message}`);
    return createFallbackStructure(content, filename, fileConfig);
  }
}

function createFallbackStructure(content, filename, fileConfig) {
  return {
    guidelines: [
      {
        title: `הנחיות מקובץ ${filename}`,
        content: content.trim(),
        subcategory: 'workflow',
        module_code: 'general',
        priority: 2,
        is_sql_example: false,
        tags: [fileConfig.type, filename.replace('.txt', '')]
      }
    ],
    sql_examples: []
  };
}

async function processFile(fileConfig, filename, modules) {
  console.log(`\n📄 Processing ${filename}...`);
  
  const filePath = filename;
  if (!fs.existsSync(filePath)) {
    console.log(`   ❌ File not found: ${filePath}`);
    return { guidelines: 0, sqlExamples: 0, errors: 0 };
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  console.log(`   📏 Content length: ${content.length} characters`);
  
  // חלוקה לחלקים אם צריך
  const maxChunkSize = 6000;
  const chunks = [];
  
  if (content.length > maxChunkSize) {
    console.log(`   📦 Splitting into chunks...`);
    const lines = content.split('\n');
    let currentChunk = '';
    
    for (const line of lines) {
      if (currentChunk.length + line.length > maxChunkSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
      }
      currentChunk += line + '\n';
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    console.log(`   📦 Split into ${chunks.length} chunks`);
  } else {
    chunks.push(content);
  }
  
  let totalGuidelines = 0;
  let totalSqlExamples = 0;
  let totalErrors = 0;
  
  // עיבוד כל חלק
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkDesc = chunks.length > 1 ? `חלק ${i + 1}/${chunks.length}` : '';
    
    console.log(`   🔍 Analyzing ${chunkDesc}...`);
    
    const aiResult = await analyzeFileWithAI(chunk, filename, fileConfig);
    
    // עיבוד הנחיות
    for (const guideline of aiResult.guidelines || []) {
      try {
        // בחירת מודול: עדיפות לקובץ, אחר כך להנחיה, אחר כך ברירת מחדל
        const moduleCode = fileConfig.module_code || guideline.module_code || 'general';
        const module = modules.find(m => m.module_code === moduleCode);
        if (!module) {
          console.log(`     ⚠️ Module ${moduleCode} not found, using general`);
        }
        
        const guidelineData = {
          category: fileConfig.category,
          subcategory: guideline.subcategory || 'general',
          module_id: module?.id || 6,
          title: guideline.title || 'הנחיה ללא כותרת',
          content: guideline.content || 'תוכן לא זמין',
          user_email: null,
          validation_status: 'approved',
          priority: guideline.priority || 2,
          active: true,
          source_file: filename,
          tags: JSON.stringify([
            ...(Array.isArray(guideline.tags) ? guideline.tags : []),
            ...fileConfig.tags,
            filename.replace('.txt', '')
          ]),
          created_by: 'ai_import',
          updated_by: 'ai_import'
        };
        
        const result = await createGuideline(guidelineData);
        if (result.success) {
          totalGuidelines++;
          console.log(`     ✅ Guideline: "${guideline.title}" (${guideline.subcategory})`);
        } else {
          totalErrors++;
          console.log(`     ❌ Failed guideline: ${result.error}`);
        }
        
      } catch (error) {
        totalErrors++;
        console.log(`     💥 Error creating guideline: ${error.message}`);
      }
    }
    
    // עיבוד דוגמאות SQL
    for (const sqlExample of aiResult.sql_examples || []) {
      try {
        // בחירת מודול: עדיפות לקובץ, אחר כך לדוגמה, אחר כך ברירת מחדל
        const moduleCode = fileConfig.module_code || sqlExample.module_code || 'general';
        const module = modules.find(m => m.module_code === moduleCode);
        
        const sqlData = {
          user_question: sqlExample.title,
          expected_sql: sqlExample.sql_content,
          explanation: sqlExample.explanation,
          difficulty_level: sqlExample.difficulty || 'basic',
          module_id: module?.id || 6,
          tags: JSON.stringify([
            moduleCode,
            ...fileConfig.tags,
            filename.replace('.txt', '')
          ]),
          active: true,
          validated: true,
          created_by: 'ai_import'
        };
        
        const result = await createQueryExample(sqlData);
        if (result.success) {
          totalSqlExamples++;
          console.log(`     💾 SQL Example: "${sqlExample.title}"`);
        } else {
          totalErrors++;
          console.log(`     ❌ Failed SQL example: ${result.error}`);
        }
        
      } catch (error) {
        totalErrors++;
        console.log(`     💥 Error creating SQL example: ${error.message}`);
      }
    }
    
    // השהיה בין חלקים
    if (i < chunks.length - 1) {
      console.log(`   ⏳ Waiting...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`   📊 File summary: ${totalGuidelines} guidelines, ${totalSqlExamples} SQL examples, ${totalErrors} errors`);
  
  return {
    guidelines: totalGuidelines,
    sqlExamples: totalSqlExamples,
    errors: totalErrors
  };
}

async function cleanAndReloadAllGuidelines() {
  try {
    console.log('🚀 Starting clean guidelines reload...\n');
    
    // קבלת מודולים עסקיים
    const modulesResult = await getBusinessModules();
    if (!modulesResult.success) {
      throw new Error('Failed to get business modules');
    }
    const modules = modulesResult.data;
    console.log(`📋 Found ${modules.length} business modules`);
    
    // ניקוי הנחיות קיימות
    await cleanAllGuidelines();
    
    // עיבוד כל קובץ
    let totalGuidelines = 0;
    let totalSqlExamples = 0;
    let totalErrors = 0;
    
    for (const [filename, fileConfig] of Object.entries(FILE_MAPPING)) {
      const result = await processFile(fileConfig, filename, modules);
      totalGuidelines += result.guidelines;
      totalSqlExamples += result.sqlExamples;
      totalErrors += result.errors;
    }
    
    console.log('\n🎉 Clean reload completed!');
    console.log(`📊 Final Results:`);
    console.log(`   📋 Total guidelines: ${totalGuidelines}`);
    console.log(`   💾 Total SQL examples: ${totalSqlExamples}`);
    console.log(`   ❌ Total errors: ${totalErrors}`);
    
    // סיכום מצב חדש
    const finalResult = await getGuidelines();
    if (finalResult.success) {
      console.log(`\n📈 Database verification: ${finalResult.data.length} guidelines`);
      
      // חלוקה לפי סוג
      const byType = {};
      const bySource = {};
      
      finalResult.data.forEach(g => {
        // לפי תגיות
        const tags = g.tags ? JSON.parse(g.tags) : [];
        const type = tags.includes('insights') ? 'insights' : 'system';
        byType[type] = (byType[type] || 0) + 1;
        
        // לפי קובץ מקור
        const source = g.source_file || 'unknown';
        bySource[source] = (bySource[source] || 0) + 1;
      });
      
      console.log('\n   📊 Distribution by type:');
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`      ${type}: ${count} guidelines`);
      });
      
      console.log('\n   📁 Distribution by source:');
      Object.entries(bySource).forEach(([source, count]) => {
        console.log(`      ${source}: ${count} guidelines`);
      });
    }
    
    return {
      success: true,
      totalGuidelines,
      totalSqlExamples,
      totalErrors
    };
    
  } catch (error) {
    console.error('❌ Clean reload failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// הרצת הסקריפט
console.log('🔧 Clean and reload script starting...');

cleanAndReloadAllGuidelines()
  .then(result => {
    if (result.success) {
      console.log('\n🎉 Clean reload completed successfully!');
      console.log('   ✅ Guidelines properly categorized');
      console.log('   ✅ SQL examples extracted');
      console.log('   ✅ Source files tracked');
      console.log('   ✅ Insights guidelines separated');
    } else {
      console.error('❌ Clean reload failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('💥 Clean reload crashed:', error);
    process.exit(1);
  });

export { cleanAndReloadAllGuidelines }; 