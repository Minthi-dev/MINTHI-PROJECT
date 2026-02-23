-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  "order" INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Policies for rooms
create policy "Rooms are viewable by everyone"
  on rooms for select
  using ( true );

create policy "Rooms are insertable by restaurant owners"
  on rooms for insert
  with check ( auth.uid() in (select owner_id from restaurants where id = restaurant_id) );

create policy "Rooms are updatable by restaurant owners"
  on rooms for update
  using ( auth.uid() in (select owner_id from restaurants where id = restaurant_id) );

create policy "Rooms are deletable by restaurant owners"
  on rooms for delete
  using ( auth.uid() in (select owner_id from restaurants where id = restaurant_id) );

-- Add room_id to tables if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tables' AND column_name = 'room_id') THEN
        ALTER TABLE tables ADD COLUMN room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;
    END IF;
END $$;
