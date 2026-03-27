require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

async function migrate() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        // Check if industry column exists
        const [cols] = await conn.query("SHOW COLUMNS FROM employer_profiles LIKE 'industry'");
        if (cols.length === 0) {
            await conn.query("ALTER TABLE employer_profiles ADD COLUMN industry VARCHAR(100) DEFAULT NULL");
            console.log('✅ Added industry column to employer_profiles');
        } else {
            console.log('ℹ️  industry column already exists');
        }

        // Update existing employers with industry info
        await conn.query("UPDATE employer_profiles SET industry = 'Technology' WHERE user_id = 2 AND (industry IS NULL OR industry = '')");
        await conn.query("UPDATE employer_profiles SET industry = 'Food & Beverage' WHERE user_id = 3 AND (industry IS NULL OR industry = '')");
        await conn.query("UPDATE employer_profiles SET industry = 'Delivery' WHERE user_id = 8 AND (industry IS NULL OR industry = '')");
        console.log('✅ Updated industry data for existing employers');

        const [profiles] = await conn.query("SELECT user_id, company_name, industry FROM employer_profiles");
        console.log('\nEmployer Profiles:');
        profiles.forEach(p => console.log(`  - ${p.company_name} (user_id: ${p.user_id}) => industry: ${p.industry}`));

    } finally {
        await conn.end();
    }
}

migrate().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});
