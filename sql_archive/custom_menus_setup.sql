-- Custom Menus System for EASYFOOD
-- Allows restaurants to create recurring menus with automatic dish activation/deactivation

-- Table for storing custom menu templates
CREATE TABLE IF NOT EXISTS custom_menus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for storing which dishes belong to each custom menu
CREATE TABLE IF NOT EXISTS custom_menu_dishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    custom_menu_id UUID NOT NULL REFERENCES custom_menus(id) ON DELETE CASCADE,
    dish_id UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(custom_menu_id, dish_id)
);

-- Table for scheduling when menus should be active
CREATE TABLE IF NOT EXISTS custom_menu_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    custom_menu_id UUID NOT NULL REFERENCES custom_menus(id) ON DELETE CASCADE,
    day_of_week INTEGER, -- 0=Sunday, 1=Monday, ..., 6=Saturday, NULL=any day
    meal_type TEXT CHECK (meal_type IN ('lunch', 'dinner', 'all')),
    start_time TIME,
    end_time TIME,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE custom_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_menu_dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_menu_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_menus
CREATE POLICY "Users can view their restaurant's custom menus"
    ON custom_menus FOR SELECT
    USING (
        restaurant_id IN (
            SELECT id FROM restaurants
            WHERE id = restaurant_id
        )
    );

CREATE POLICY "Users can create custom menus for their restaurant"
    ON custom_menus FOR INSERT
    WITH CHECK (
        restaurant_id IN (
            SELECT id FROM restaurants
            WHERE id = restaurant_id
        )
    );

CREATE POLICY "Users can update their restaurant's custom menus"
    ON custom_menus FOR UPDATE
    USING (
        restaurant_id IN (
            SELECT id FROM restaurants
            WHERE id = restaurant_id
        )
    );

CREATE POLICY "Users can delete their restaurant's custom menus"
    ON custom_menus FOR DELETE
    USING (
        restaurant_id IN (
            SELECT id FROM restaurants
            WHERE id = restaurant_id
        )
    );

-- RLS Policies for custom_menu_dishes
CREATE POLICY "Users can view their menu dishes"
    ON custom_menu_dishes FOR SELECT
    USING (
        custom_menu_id IN (
            SELECT id FROM custom_menus
            WHERE restaurant_id IN (SELECT id FROM restaurants WHERE id = custom_menus.restaurant_id)
        )
    );

CREATE POLICY "Users can manage their menu dishes"
    ON custom_menu_dishes FOR ALL
    USING (
        custom_menu_id IN (
            SELECT id FROM custom_menus
            WHERE restaurant_id IN (SELECT id FROM restaurants WHERE id = custom_menus.restaurant_id)
        )
    );

-- RLS Policies for custom_menu_schedules
CREATE POLICY "Users can view their menu schedules"
    ON custom_menu_schedules FOR SELECT
    USING (
        custom_menu_id IN (
            SELECT id FROM custom_menus
            WHERE restaurant_id IN (SELECT id FROM restaurants WHERE id = custom_menus.restaurant_id)
        )
    );

CREATE POLICY "Users can manage their menu schedules"
    ON custom_menu_schedules FOR ALL
    USING (
        custom_menu_id IN (
            SELECT id FROM custom_menus
            WHERE restaurant_id IN (SELECT id FROM restaurants WHERE id = custom_menus.restaurant_id)
        )
    );

-- Function to apply a custom menu (activates selected dishes, deactivates others)
CREATE OR REPLACE FUNCTION apply_custom_menu(menu_id UUID)
RETURNS void AS $$
DECLARE
    restaurant_uuid UUID;
BEGIN
    -- Get restaurant_id from the menu
    SELECT restaurant_id INTO restaurant_uuid FROM custom_menus WHERE id = menu_id;

    -- Deactivate all dishes for this restaurant
    UPDATE dishes SET is_active = false WHERE restaurant_id = restaurant_uuid;

    -- Activate only the dishes in this custom menu
    UPDATE dishes
    SET is_active = true
    WHERE id IN (
        SELECT dish_id FROM custom_menu_dishes WHERE custom_menu_id = menu_id
    );

    -- Mark this menu as active, deactivate others
    UPDATE custom_menus SET is_active = false WHERE restaurant_id = restaurant_uuid;
    UPDATE custom_menus SET is_active = true WHERE id = menu_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset to full menu (activate all dishes)
CREATE OR REPLACE FUNCTION reset_to_full_menu(restaurant_uuid UUID)
RETURNS void AS $$
BEGIN
    -- Activate all dishes for this restaurant
    UPDATE dishes SET is_active = true WHERE restaurant_id = restaurant_uuid;

    -- Deactivate all custom menus
    UPDATE custom_menus SET is_active = false WHERE restaurant_id = restaurant_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_custom_menus_restaurant ON custom_menus(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_custom_menu_dishes_menu ON custom_menu_dishes(custom_menu_id);
CREATE INDEX IF NOT EXISTS idx_custom_menu_dishes_dish ON custom_menu_dishes(dish_id);
CREATE INDEX IF NOT EXISTS idx_custom_menu_schedules_menu ON custom_menu_schedules(custom_menu_id);
CREATE INDEX IF NOT EXISTS idx_custom_menu_schedules_day ON custom_menu_schedules(day_of_week);

COMMENT ON TABLE custom_menus IS 'Stores custom menu templates for restaurants';
COMMENT ON TABLE custom_menu_dishes IS 'Maps which dishes belong to each custom menu';
COMMENT ON TABLE custom_menu_schedules IS 'Defines when custom menus should be automatically applied';
COMMENT ON FUNCTION apply_custom_menu IS 'Activates a custom menu by enabling only its dishes';
COMMENT ON FUNCTION reset_to_full_menu IS 'Resets to full menu by enabling all dishes';
