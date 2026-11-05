export interface MenuDish {
  id: string
  categoryId: string | null
  name: string
  description: string | null
  price: number
  allergens: string[]
  imageUrl: string | null
  isAvailable: boolean
  includedInAyce: boolean
  ayceMaxPerPerson: number | null
  shortCode: string | null
}

export interface MenuCategory {
  id: string
  name: string
}

export interface PublicMenu {
  categories: MenuCategory[]
  dishes: MenuDish[]
}

export interface CartLine {
  key: string
  dishId: string
  quantity: number
  notes: string
  course: number
}
