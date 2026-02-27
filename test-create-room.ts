import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function testCreate() {
  console.log('Testing room creation...')
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert([{
      name: 'Test Room',
      total_teams: 2,
      base_point: 1000,
      members_per_team: 5,
    }])
    .select()
    .single();

  if (roomError) {
    console.error('Room Error:', roomError)
    return
  }
  console.log('Room created:', room.id)

  const teamsData = [
    {
      room_id: room.id,
      name: 'Team 1',
      point_balance: 1000,
      leader_name: 'Leader 1',
      leader_position: '탑',
      leader_description: '',
      captain_points: 0,
    },
    {
      room_id: room.id,
      name: 'Team 2',
      point_balance: 1000,
      leader_name: 'Leader 2',
      leader_position: '정글',
      leader_description: '',
      captain_points: 0,
    }
  ];

  const { data: teamsResult, error: teamsError } = await supabase
    .from('teams').insert(teamsData).select();

  if (teamsError) {
    console.error('Teams Error:', teamsError)
    return
  }
  console.log('Teams created:', teamsResult.length)
  console.log('Test successful!')
}

testCreate()
