package models
type Employee struct {
	ID          string       `gorm:"primaryKey;size:36" json:"id"`	
	Name        string       `gorm:"not null;size:255" json:"name"`
	Email       string       `gorm:"size:255" json:"email"`
	Position    string       `gorm:"size:255" json:"position"`
	Phone       string       `gorm:"size:50" json:"phone"`		
}

// 公司-员工关联表（多对多关系）
type CompanyEmployee struct {
	CompanyID  string `gorm:"primaryKey;column:company_id;size:36" json:"company_id"`
	EmployeeID string `gorm:"primaryKey;column:employee_id;size:36" json:"employee_id"`
}

// 部门-员工关联表（多对多关系）
type DepartmentEmployee struct {
	DepartmentID uint   `gorm:"primaryKey;column:department_id" json:"department_id"`
	EmployeeID   string `gorm:"primaryKey;column:employee_id;size:36" json:"employee_id"`
	CompanyID    string `gorm:"not null;size:36;index;column:company_id" json:"company_id"` // 冗余字段，便于查询
}