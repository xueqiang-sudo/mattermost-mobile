package models
type Company struct {
	ID          string       `gorm:"primaryKey;size:36" json:"id"`
	Name        string       `gorm:"not null;size:255" json:"name"`
	Type        string       `gorm:"size:50" json:"type"`
	Description string       `gorm:"type:text" json:"description"`
	OwnerID     string       `gorm:"size:36;index;not null" json:"owner_id"` // 企业拥有者ID
	Departments []Department `gorm:"foreignKey:CompanyID" json:"departments,omitempty"`
	Employees   []Employee   `gorm:"many2many:company_employees;" json:"employees,omitempty"`
}