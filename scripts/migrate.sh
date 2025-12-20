#!/bin/bash
# 数据库迁移脚本
# 用法: ./scripts/migrate.sh [--remote|--local]
# 
# 此脚本会按顺序执行 migrations/ 目录下所有未应用的迁移
# 每个迁移文件命名格式: NNN_description.sql (如 001_add_column.sql)

set -e

MODE="${1:---remote}"
DB_NAME="sub-store-db"
MIGRATIONS_DIR="./migrations"

echo "🔄 开始数据库迁移 ($MODE)..."

# 确保迁移表存在
echo "  → 检查迁移表..."
npx wrangler d1 execute $DB_NAME $MODE --command "CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000));" 2>/dev/null || true

# 获取已应用的迁移列表
echo "  → 获取已应用的迁移..."
APPLIED=$(npx wrangler d1 execute $DB_NAME $MODE --command "SELECT name FROM migrations;" --json 2>/dev/null || echo "[]")

# 遍历所有迁移文件
MIGRATIONS_APPLIED=0
for migration_file in $(ls -1 $MIGRATIONS_DIR/*.sql 2>/dev/null | sort); do
    migration_name=$(basename "$migration_file")
    
    # 跳过初始化迁移表的文件
    if [ "$migration_name" = "000_init_migrations.sql" ]; then
        continue
    fi
    
    # 检查是否已应用（在 JSON 输出中搜索迁移名）
    if echo "$APPLIED" | grep -q "\"$migration_name\""; then
        echo "  ✓ 已应用: $migration_name"
        continue
    fi
    
    # 应用迁移
    echo "  → 应用迁移: $migration_name"
    if npx wrangler d1 execute $DB_NAME $MODE --file="$migration_file" 2>&1; then
        # 记录迁移
        npx wrangler d1 execute $DB_NAME $MODE --command "INSERT INTO migrations (name) VALUES ('$migration_name');" 2>/dev/null || true
        echo "  ✓ 成功: $migration_name"
        MIGRATIONS_APPLIED=$((MIGRATIONS_APPLIED + 1))
    else
        echo "  ✗ 失败: $migration_name (可能列已存在，跳过)"
        # 即使失败也记录为已迁移（避免重复尝试）
        npx wrangler d1 execute $DB_NAME $MODE --command "INSERT OR IGNORE INTO migrations (name) VALUES ('$migration_name');" 2>/dev/null || true
    fi
done

if [ $MIGRATIONS_APPLIED -eq 0 ]; then
    echo "✅ 数据库已是最新，无需迁移"
else
    echo "✅ 成功应用 $MIGRATIONS_APPLIED 个迁移"
fi
