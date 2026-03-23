package models
type Department struct {
	ID          uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	CompanyID   string     `gorm:"not null;size:36;index" json:"company_id"`
	Name        string     `gorm:"not null;size:255" json:"name"`
	Description string     `gorm:"type:text" json:"description"`
	ParentID    *uint      `gorm:"index" json:"parent_id"`
	
	// 自引用关系，用于获取子部门
	Children    []Department `gorm:"foreignkey:ParentID" json:"children,omitempty"`
	//Company     Company      `gorm:"foreignKey:CompanyID" json:"company,omitempty"`
	Employees   []Employee   `gorm:"many2many:department_employees;" json:"employees,omitempty"`
}