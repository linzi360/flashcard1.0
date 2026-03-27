package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// ==================== 数据模型 ====================

// ReviewHistory 单张卡片的复习历史记录
type ReviewHistory struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	CardID     uint      `json:"card_id"`
	Quality    int       `json:"quality"`    // 复习质量 0-4
	Interval   int       `json:"interval"`   // 当时的间隔
	EaseFactor float64   `json:"ease_factor"` // 当时的易度因子
	ReviewedAt time.Time `json:"reviewed_at"`
}

// Flashcard 闪卡模型
type Flashcard struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Front       string    `json:"front"` // 正面内容（支持HTML/Markdown）
	Back        string    `json:"back"`  // 背面内容
	Tags        string    `json:"tags"`  // 标签（逗号分隔）
	Attachments string    `gorm:"type:text" json:"attachments"` // JSON数组存储附件URL
	EaseFactor  float64   `gorm:"default:2.5" json:"ease_factor"`
	Interval    int       `gorm:"default:1" json:"interval"`
	Repetitions int       `gorm:"default:0" json:"repetitions"`
	NextReview  time.Time `json:"next_review"`
	LastReviewed *time.Time `json:"last_reviewed"`
	CreatedAt   time.Time `json:"created_at"`
	Histories   []ReviewHistory `gorm:"foreignKey:CardID" json:"histories,omitempty"`
}

// QuizItem 测验题目
type QuizItem struct {
	Type        string   `json:"type"` // choice or fill
	Front       string   `json:"front"`
	Options     []string `json:"options,omitempty"`
	Answer      string   `json:"answer"`
	BlankAnswer string   `json:"blank_answer,omitempty"`
}

// Config 配置模型
type Config struct {
	Key   string `gorm:"primaryKey" json:"key"`
	Value string `json:"value"`
}

// Review SM-2算法核心逻辑（同时记录历史）
func (f *Flashcard) Review(quality int, db *gorm.DB) {
	if quality < 0 || quality > 4 {
		return
	}
	// 记录历史
	history := ReviewHistory{
		CardID:     f.ID,
		Quality:    quality,
		Interval:   f.Interval,
		EaseFactor: f.EaseFactor,
		ReviewedAt: time.Now(),
	}
	db.Create(&history)

	// 更新易度因子
	f.EaseFactor += 0.1 - (4-float64(quality))*(0.08+(4-float64(quality))*0.02)
	if f.EaseFactor < 1.3 {
		f.EaseFactor = 1.3
	}
	// 更新间隔和重复次数
	if quality < 2 {
		f.Repetitions = 0
		f.Interval = 1
	} else {
		if f.Repetitions == 0 {
			f.Interval = 1
		} else if f.Repetitions == 1 {
			f.Interval = 3
		} else {
			f.Interval = int(float64(f.Interval)*f.EaseFactor + 0.5)
		}
		f.Repetitions++
	}
	// 更新日期
	now := time.Now().Truncate(24 * time.Hour)
	f.LastReviewed = &now
	f.NextReview = now.AddDate(0, 0, f.Interval)
}

func main() {
	// 初始化数据库
	dbPath := "./flashcards.db"
	if envPath := os.Getenv("FLASHCARD_DB_PATH"); envPath != "" {
		dbPath = envPath
	}
	// 修复后：纯Go SQLite，无CGO依赖
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		panic("failed to connect database")
	}
	db.AutoMigrate(&Flashcard{}, &Config{}, &ReviewHistory{})

	// 确保 uploads 目录存在
	os.MkdirAll("./uploads", 0755)

	r := gin.Default()
	// CORS 配置
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})
	// 静态文件服务（用于附件）
	r.Static("/uploads", "./uploads")

	api := r.Group("/api")
	{
		// 获取所有卡片
		api.GET("/cards", func(c *gin.Context) {
			var cards []Flashcard
			tag := c.Query("tag")
			if tag != "" {
				db.Where("tags LIKE ?", "%"+tag+"%").Find(&cards)
			} else {
				db.Find(&cards)
			}
			c.JSON(http.StatusOK, cards)
		})

		// 获取单张卡片详情（含历史）
		api.GET("/cards/:id", func(c *gin.Context) {
			var card Flashcard
			result := db.Preload("Histories", func(db *gorm.DB) *gorm.DB {
				return db.Order("reviewed_at ASC")
			}).First(&card, c.Param("id"))
			if result.Error != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
				return
			}
			c.JSON(http.StatusOK, card)
		})

		// 添加卡片
		api.POST("/cards", func(c *gin.Context) {
			var card Flashcard
			if c.ShouldBindJSON(&card) == nil {
				card.NextReview = time.Now().Truncate(24 * time.Hour)
				db.Create(&card)
			}
			c.JSON(http.StatusOK, card)
		})

		// 更新卡片
		api.PUT("/cards/:id", func(c *gin.Context) {
			var card Flashcard
			result := db.First(&card, c.Param("id"))
			if result.Error != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
				return
			}
			var updateData Flashcard
			if c.ShouldBindJSON(&updateData) == nil {
				card.Front = updateData.Front
				card.Back = updateData.Back
				card.Tags = updateData.Tags
				card.Attachments = updateData.Attachments
				db.Save(&card)
			}
			c.JSON(http.StatusOK, card)
		})

		// 获取今日待复习卡片
		api.GET("/cards/due", func(c *gin.Context) {
			var cards []Flashcard
			tag := c.Query("tag")
			today := time.Now().Truncate(24 * time.Hour)
			query := db.Where("next_review <= ?", today)
			if tag != "" {
				query = query.Where("tags LIKE ?", "%"+tag+"%")
			}
			query.Find(&cards)
			c.JSON(http.StatusOK, cards)
		})

		// 提交复习结果
		api.POST("/cards/:id/review", func(c *gin.Context) {
			var card Flashcard
			result := db.First(&card, c.Param("id"))
			if result.Error != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "card not found"})
				return
			}
			var req struct{ Quality int }
			if c.ShouldBindJSON(&req) == nil {
				card.Review(req.Quality, db)
				db.Save(&card)
			}
			c.JSON(http.StatusOK, card)
		})

		// 附件上传
		api.POST("/upload", func(c *gin.Context) {
			file, header, err := c.Request.FormFile("file")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			defer file.Close()

			// 生成唯一文件名
			ext := filepath.Ext(header.Filename)
			filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
			filePath := filepath.Join("./uploads", filename)

			// 保存文件
			dst, err := os.Create(filePath)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			defer dst.Close()
			io.Copy(dst, file)

			// 返回 URL
			url := fmt.Sprintf("http://localhost:8080/uploads/%s", filename)
			c.JSON(http.StatusOK, gin.H{"url": url, "type": header.Header.Get("Content-Type")})
		})

		// 批量导入 CSV
		api.POST("/cards/import", func(c *gin.Context) {
			file, _, err := c.Request.FormFile("file")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			defer file.Close()

			reader := csv.NewReader(file)
			records, err := reader.ReadAll()
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid CSV file"})
				return
			}

			count := 0
			for i, record := range records {
				if i == 0 && len(record) >= 2 {
					// 跳过标题行
					continue
				}
				if len(record) >= 2 {
					card := Flashcard{
						Front:      record[0],
						Back:       record[1],
						NextReview: time.Now().Truncate(24 * time.Hour),
					}
					if len(record) > 2 {
						card.Tags = record[2]
					}
					db.Create(&card)
					count++
				}
			}
			c.JSON(http.StatusOK, gin.H{"message": "导入成功", "count": count})
		})

		// 导出 CSV
		api.GET("/cards/export", func(c *gin.Context) {
			var cards []Flashcard
			db.Find(&cards)

			c.Header("Content-Type", "text/csv; charset=utf-8")
			c.Header("Content-Disposition", "attachment; filename=flashcards.csv")

			writer := csv.NewWriter(c.Writer)
			writer.Write([]string{"Front", "Back", "Tags"}) // 标题行

			for _, card := range cards {
				writer.Write([]string{card.Front, card.Back, card.Tags})
			}
			writer.Flush()
		})

		// 生成测验
		api.GET("/quiz", func(c *gin.Context) {
			limit := 10
			if l := c.Query("limit"); l != "" {
				if num, err := strconv.Atoi(l); err == nil {
					limit = num
				}
			}

			var cards []Flashcard
			tag := c.Query("tag")
			query := db.Order("RANDOM()").Limit(limit)
			if tag != "" {
				query = query.Where("tags LIKE ?", "%"+tag+"%")
			}
			query.Find(&cards)

			var quiz []QuizItem
			for _, card := range cards {
				// 根据答案长度决定题型
				if len(card.Back) > 50 {
					// 填空题
					blank := card.Back
					if len(card.Back) > 4 {
						mid := len(card.Back) / 2
						start := mid - 2
						if start < 0 {
							start = 0
						}
						end := mid + 3
						if end > len(card.Back) {
							end = len(card.Back)
						}
						blank = card.Back[:start] + "_____" + card.Back[end:]
					}
					quiz = append(quiz, QuizItem{
						Type:        "fill",
						Front:       card.Front,
						Answer:      card.Back,
						BlankAnswer: blank,
					})
				} else {
					// 选择题 - 简化版只包含正确答案
					quiz = append(quiz, QuizItem{
						Type:    "choice",
						Front:   card.Front,
						Options: []string{card.Back},
						Answer:  card.Back,
					})
				}
			}
			c.JSON(http.StatusOK, quiz)
		})

		// 学习报告
		api.GET("/report", func(c *gin.Context) {
			var total, newCards, dueCardsCount, matureCards int64

			// 总卡片数
			db.Model(&Flashcard{}).Count(&total)

			// 新卡片（从未复习过）
			db.Model(&Flashcard{}).Where("last_reviewed IS NULL").Count(&newCards)

			// 今日到期卡片
			today := time.Now().Truncate(24 * time.Hour)
			db.Model(&Flashcard{}).Where("next_review <= ?", today).Count(&dueCardsCount)

			// 成熟卡片（间隔>=21 天）
			db.Model(&Flashcard{}).Where("interval >= ?", 21).Count(&matureCards)

			// 获取每日学习热力图数据（最近 30 天）
			type HeatmapData struct {
				Date  string `json:"date"`
				Count int    `json:"count"`
			}
			var heatmap []HeatmapData

			startDate := time.Now().AddDate(0, 0, -30)
			for i := 0; i <= 30; i++ {
				date := startDate.AddDate(0, 0, i)
				var count int64
				// 查询当天的复习记录数
				db.Model(&ReviewHistory{}).Where("DATE(reviewed_at) = ?", date.Format("2006-01-02")).Count(&count)
				heatmap = append(heatmap, HeatmapData{
					Date:  date.Format("2006-01-02"),
					Count: int(count),
				})
			}

			// 获取每日目标配置
			dailyGoal := "20"
			var config Config
			if db.Where("key = ?", "daily_goal").First(&config).Error == nil {
				dailyGoal = config.Value
			}

			c.JSON(http.StatusOK, gin.H{
				"total":        total,
				"new_cards":    newCards,
				"due_cards":    dueCardsCount,
				"mature_cards": matureCards,
				"heatmap":      heatmap,
				"daily_goal":   dailyGoal,
			})
		})

		// 配置管理
		api.POST("/config", func(c *gin.Context) {
			var config Config
			if c.ShouldBindJSON(&config) == nil {
				db.Where("key = ?", config.Key).Assign(config).FirstOrCreate(&config)
			}
			c.JSON(http.StatusOK, config)
		})
	}

	r.Run(":8080")
}