const fs = require('fs');
const path = require('path');

const rootDir = 'c:\\PLMS';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('dist') && !file.includes('.pm2')) {
                results = results.concat(walk(file));
            }
        } else {
            if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx') || 
                file.endsWith('.json') || file.endsWith('.md') || file.endsWith('.yaml') || 
                file.endsWith('.html') || file.endsWith('.ino') || file.endsWith('.example')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(rootDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // We do NOT want to replace 'aqms_user' or 'aqms' in the DB URL.
    // So we'll skip DB urls, or replace carefully.
    
    // Replace 'Predictive Life Monitoring System' with 'Predictive Life Monitoring System'
    content = content.replace(/Predictive Life Monitoring System/g, 'Predictive Life Monitoring System');
    content = content.replace(/Predictive Life Monitoring/g, 'Predictive Life Monitoring');
    
    // Replace 'PLMS' with 'PLMS'
    content = content.replace(/PLMS/g, 'PLMS');
    
    // Replace 'plms_' with 'plms_' (except aqms_user)
    content = content.replace(/plms_(?!user)/g, 'plms_');

    // Replace 'plms-' with 'plms-'
    content = content.replace(/plms-/g, 'plms-');

    // Replace 'plms/' with 'plms/'
    content = content.replace(/aqms\//g, 'plms/');

    // Replace '"aqms"' mapped keys if any? Let's just do \baqms\b
    // wait, be careful because the DB URL has /aqms at the end.
    // Better to just manually replace the specific instances like 'plms_ai_key', 'plms_session'
    
    content = content.replace(/plms_ai_key/g, 'plms_ai_key');
    content = content.replace(/plms_session/g, 'plms_session');
    
    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
    }
});
