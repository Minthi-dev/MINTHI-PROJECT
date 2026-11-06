import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRestaurant } from '@/features/auth/AuthProvider'
import { rpc, unwrap } from '@/shared/lib/api'
import { supabase, type Tables, type TablesInsert } from '@/shared/lib/supabase'

export type Category = Tables<'categories'>
export type Dish = Tables<'dishes'>
export type CustomMenu = Tables<'custom_menus'> & { custom_menu_dishes: { dish_id: string }[]; custom_menu_schedules: { day_of_week: number; period: string }[] }

export const menuKey = (rid: string) => ['r', rid, 'menu'] as const

export function useMenuAdmin() {
  const r = useRestaurant()
  return useQuery({
    queryKey: [...menuKey(r.id), 'admin'],
    queryFn: async () => {
      const [cats, dishes, menus] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', r.id).order('sort_order').order('name'),
        supabase.from('dishes').select('*').eq('restaurant_id', r.id).order('sort_order').order('name'),
        supabase.from('custom_menus').select('*, custom_menu_dishes(dish_id), custom_menu_schedules(day_of_week, period)').eq('restaurant_id', r.id).order('created_at'),
      ])
      return { categories: unwrap(cats), dishes: unwrap(dishes), menus: unwrap(menus) as unknown as CustomMenu[] }
    },
  })
}

function useMenuMutation<A>(fn: (a: A) => Promise<unknown>, success?: string) {
  const r = useRestaurant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: menuKey(r.id) })
      if (success) toast.success(success)
    },
  })
}

export function useSaveDish() {
  const r = useRestaurant()
  return useMenuMutation(async (d: Partial<Dish> & Pick<TablesInsert<'dishes'>, 'name' | 'price'>) => {
    const row = { ...d, restaurant_id: r.id }
    return d.id
      ? unwrap(await supabase.from('dishes').update(row).eq('id', d.id).select().single())
      : unwrap(await supabase.from('dishes').insert(row).select().single())
  }, 'Piatto salvato')
}

export const usePatchDish = () => useMenuMutation(async (a: { id: string; patch: Partial<Dish> }) => unwrap(await supabase.from('dishes').update(a.patch).eq('id', a.id).select('id').single()))
export const useDeleteDish = () => useMenuMutation(async (id: string) => unwrap(await supabase.from('dishes').delete().eq('id', id).select('id')), 'Piatto eliminato')
export const useSetAvailability = () => useMenuMutation((a: { id: string; available: boolean }) => rpc('set_dish_availability', { p_dish_id: a.id, p_available: a.available }))

export function useSaveCategory() {
  const r = useRestaurant()
  return useMenuMutation(async (c: Partial<Category> & { name: string }) => c.id
    ? unwrap(await supabase.from('categories').update(c).eq('id', c.id).select().single())
    : unwrap(await supabase.from('categories').insert({ ...c, restaurant_id: r.id }).select().single()), 'Categoria salvata')
}
export const useDeleteCategory = () => useMenuMutation(async (id: string) => unwrap(await supabase.from('categories').delete().eq('id', id).select('id')), 'Categoria eliminata')

export function useReorder(table: 'categories' | 'dishes') {
  return useMenuMutation(async (ids: string[]) => {
    await Promise.all(ids.map((id, i) => supabase.from(table).update({ sort_order: i }).eq('id', id)))
  })
}

export function useSaveCustomMenu() {
  const r = useRestaurant()
  return useMenuMutation(async (m: { id?: string; name: string; description?: string | null; dishIds: string[]; schedules: { day_of_week: number; period: 'lunch' | 'dinner' }[] }) => {
    const saved = m.id
      ? unwrap(await supabase.from('custom_menus').update({ name: m.name, description: m.description ?? null }).eq('id', m.id).select().single())
      : unwrap(await supabase.from('custom_menus').insert({ name: m.name, description: m.description ?? null, restaurant_id: r.id }).select().single())
    unwrap(await supabase.from('custom_menu_dishes').delete().eq('custom_menu_id', saved.id).select('dish_id'))
    if (m.dishIds.length) unwrap(await supabase.from('custom_menu_dishes').insert(m.dishIds.map((dish_id) => ({ custom_menu_id: saved.id, dish_id }))).select('dish_id'))
    unwrap(await supabase.from('custom_menu_schedules').delete().eq('custom_menu_id', saved.id).select('id'))
    if (m.schedules.length) unwrap(await supabase.from('custom_menu_schedules').insert(m.schedules.map((s) => ({ ...s, custom_menu_id: saved.id }))).select('id'))
    return saved
  }, 'Menu salvato')
}
export const useDeleteCustomMenu = () => useMenuMutation(async (id: string) => unwrap(await supabase.from('custom_menus').delete().eq('id', id).select('id')), 'Menu eliminato')

export async function uploadImage(bucket: 'dishes' | 'logos', restaurantId: string, file: File): Promise<string> {
  if (file.size > (bucket === 'dishes' ? 5 : 2) * 1024 * 1024) throw new Error('Immagine troppo grande.')
  const blob = await resizeImage(file, bucket === 'dishes' ? 1200 : 512)
  const path = `${restaurantId}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/webp', upsert: false })
  if (error) throw new Error('Caricamento non riuscito.')
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/** Ridimensiona e converte in WebP lato client (foto da telefono = file enormi). */
async function resizeImage(file: File, max: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Immagine non valida'))), 'image/webp', 0.85))
}
