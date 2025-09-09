import { useState, useEffect, useCallback } from 'react';
import { espnAPIService, ESPNPlayer, ESPNRanking, ESPNInjuryReport, ESPNFantasyProjection } from '../services/ESPNAPIService';

interface ESPNDataHook {
  isInitialized: boolean;
  isLoading: boolean;
  error?: string;
  lastUpdate?: Date;
  players: ESPNPlayer[];
  rankings: ESPNRanking[];
  injuries: ESPNInjuryReport[];
  projections: ESPNFantasyProjection[];
  refreshData: () => Promise<void>;
  clearCache: () => void;
}

export function useESPNData(): ESPNDataHook {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [lastUpdate, setLastUpdate] = useState<Date>();
  const [players, setPlayers] = useState<ESPNPlayer[]>([]);
  const [rankings, setRankings] = useState<ESPNRanking[]>([]);
  const [injuries, setInjuries] = useState<ESPNInjuryReport[]>([]);
  const [projections, setProjections] = useState<ESPNFantasyProjection[]>([]);

  // Initialize ESPN API Service and load data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(undefined);

      // Initialize ESPN service if not ready
      if (!espnAPIService.isReady()) {
        console.log('🚀 Initializing ESPN API Service...');
        const initSuccess = await espnAPIService.initialize();
        if (!initSuccess) {
          throw new Error('ESPN API Service initialization failed');
        }
      }

      console.log('📊 Loading real ESPN data...');

      // Fetch real data from ESPN API service
      const [playersData, rankingsData, injuriesData, projectionsData] = await Promise.all([
        espnAPIService.getAllPlayers().catch(err => {
          console.warn('Players fetch failed, using fallback:', err);
          return [];
        }),
        espnAPIService.getFantasyRankings().catch(err => {
          console.warn('Rankings fetch failed, using fallback:', err);
          return [];
        }),
        espnAPIService.getInjuryReports().catch(err => {
          console.warn('Injuries fetch failed, using fallback:', err);
          return [];
        }),
        espnAPIService.getFantasyProjections().catch(err => {
          console.warn('Projections fetch failed, using fallback:', err);
          return [];
        })
      ]);

      // Update state with real data
      setPlayers(playersData);
      setRankings(rankingsData);
      setInjuries(injuriesData);
      setProjections(projectionsData);
      setLastUpdate(new Date());
      setIsInitialized(true);

      console.log(`✅ Real ESPN data loaded:
        • Players: ${playersData.length}
        • Rankings: ${rankingsData.length} 
        • Injuries: ${injuriesData.length}
        • Projections: ${projectionsData.length}`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error loading ESPN data';
      setError(errorMessage);
      console.error('❌ ESPN data loading failed:', errorMessage);

      // Load fallback data for draft functionality
      const fallbackData = await loadFallbackData();
      setPlayers(fallbackData.players);
      setRankings(fallbackData.rankings);
      setInjuries(fallbackData.injuries);
      setProjections(fallbackData.projections);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load fallback data if ESPN API fails
  const loadFallbackData = async () => {
    console.log('🔄 Loading fallback fantasy data for draft...');
    
    // Generate realistic fallback data for draft functionality
    const fallbackPlayers: ESPNPlayer[] = [
      { id: '1', displayName: 'Josh Allen', firstName: 'Josh', lastName: 'Allen', position: { name: 'Quarterback', abbreviation: 'QB' }, team: { id: 'BUF', name: 'Buffalo Bills', abbreviation: 'BUF' } },
      { id: '2', displayName: 'Christian McCaffrey', firstName: 'Christian', lastName: 'McCaffrey', position: { name: 'Running Back', abbreviation: 'RB' }, team: { id: 'SF', name: 'San Francisco 49ers', abbreviation: 'SF' } },
      { id: '3', displayName: 'Tyreek Hill', firstName: 'Tyreek', lastName: 'Hill', position: { name: 'Wide Receiver', abbreviation: 'WR' }, team: { id: 'MIA', name: 'Miami Dolphins', abbreviation: 'MIA' } },
      { id: '4', displayName: 'Travis Kelce', firstName: 'Travis', lastName: 'Kelce', position: { name: 'Tight End', abbreviation: 'TE' }, team: { id: 'KC', name: 'Kansas City Chiefs', abbreviation: 'KC' } },
      { id: '5', displayName: 'Cooper Kupp', firstName: 'Cooper', lastName: 'Kupp', position: { name: 'Wide Receiver', abbreviation: 'WR' }, team: { id: 'LAR', name: 'Los Angeles Rams', abbreviation: 'LAR' } }
    ];

    const fallbackRankings: ESPNRanking[] = fallbackPlayers.map((player, i) => ({
      playerId: player.id,
      playerName: player.displayName,
      position: player.position.abbreviation,
      team: player.team.abbreviation,
      rank: i + 1,
      tier: Math.ceil((i + 1) / 3),
      adp: i + 1,
      projectedPoints: 20 - i,
      updated: new Date()
    }));

    return {
      players: fallbackPlayers,
      rankings: fallbackRankings,
      injuries: [],
      projections: []
    };
  };

  // Refresh data function
  const refreshData = useCallback(async () => {
    console.log('🔄 Refreshing ESPN data...');
    await loadData();
  }, [loadData]);

  // Clear cache function
  const clearCache = useCallback(() => {
    console.log('🗑️ Clearing ESPN cache...');
    espnAPIService.clearCache();
  }, []);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    isInitialized,
    isLoading,
    error,
    lastUpdate,
    players,
    rankings,
    injuries,
    projections,
    refreshData,
    clearCache,
  };
}