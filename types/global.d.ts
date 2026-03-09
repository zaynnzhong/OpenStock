declare global {
    type SignInFormData = {
        email: string;
        password: string;
    };

    type SignUpFormData = {
        fullName: string;
        email: string;
        password: string;
        country: string;
        investmentGoals: string;
        riskTolerance: string;
        preferredIndustry: string;
    };

    type CountrySelectProps = {
        name: string;
        label: string;
        control: Control;
        error?: FieldError;
        required?: boolean;
    };

    type FormInputProps = {
        name: string;
        label: string;
        placeholder: string;
        type?: string;
        register: UseFormRegister;
        error?: FieldError;
        validation?: RegisterOptions;
        disabled?: boolean;
        value?: string;
    };

    type Option = {
        value: string;
        label: string;
    };

    type SelectFieldProps = {
        name: string;
        label: string;
        placeholder: string;
        options: readonly Option[];
        control: Control;
        error?: FieldError;
        required?: boolean;
    };

    type FooterLinkProps = {
        text: string;
        linkText: string;
        href: string;
    };

    type SearchCommandProps = {
        renderAs?: 'button' | 'text';
        label?: string;
        initialStocks: StockWithWatchlistStatus[];
    };

    type WelcomeEmailData = {
        email: string;
        name: string;
        intro: string;
    };

    type User = {
        id: string;
        name: string;
        email: string;
    };

    type Stock = {
        symbol: string;
        name: string;
        exchange: string;
        type: string;
    };

    type StockWithWatchlistStatus = Stock & {
        isInWatchlist: boolean;
    };

    type FinnhubSearchResult = {
        symbol: string;
        description: string;
        displaySymbol?: string;
        type: string;
    };

    type FinnhubSearchResponse = {
        count: number;
        result: FinnhubSearchResult[];
    };

    type StockDetailsPageProps = {
        params: Promise<{
            symbol: string;
        }>;
    };

    type WatchlistButtonProps = {
        symbol: string;
        company: string;
        isInWatchlist: boolean;
        showTrashIcon?: boolean;
        type?: 'button' | 'icon';
        onWatchlistChange?: (symbol: string, isAdded: boolean) => void;
    };

    type QuoteData = {
        c?: number;
        dp?: number;
    };

    type ProfileData = {
        name?: string;
        marketCapitalization?: number;
    };

    type FinancialsData = {
        metric?: { [key: string]: number };
    };

    type SelectedStock = {
        symbol: string;
        company: string;
        currentPrice?: number;
    };

    type WatchlistTableProps = {
        watchlist: StockWithData[];
    };

    type StockWithData = {
        userId: string;
        symbol: string;
        company: string;
        addedAt: Date;
        currentPrice?: number;
        changePercent?: number;
        priceFormatted?: string;
        changeFormatted?: string;
        marketCap?: string;
        peRatio?: string;
    };

    type AlertsListProps = {
        alertData: Alert[] | undefined;
    };

    type MarketNewsArticle = {
        id: number;
        headline: string;
        summary: string;
        source: string;
        url: string;
        datetime: number;
        category: string;
        related: string;
        image?: string;
    };

    type WatchlistNewsProps = {
        news?: MarketNewsArticle[];
    };

    type SearchCommandProps = {
        open?: boolean;
        setOpen?: (open: boolean) => void;
        renderAs?: 'button' | 'text';
        buttonLabel?: string;
        buttonVariant?: 'primary' | 'secondary';
        className?: string;
    };

    type AlertData = {
        symbol: string;
        company: string;
        alertName: string;
        alertType: 'upper' | 'lower';
        threshold: string;
    };

    type AlertModalProps = {
        alertId?: string;
        alertData?: AlertData;
        action?: string;
        open: boolean;
        setOpen: (open: boolean) => void;
    };

    type RawNewsArticle = {
        id: number;
        headline?: string;
        summary?: string;
        source?: string;
        url?: string;
        datetime?: number;
        image?: string;
        category?: string;
        related?: string;
    };

    type Alert = {
        id: string;
        symbol: string;
        company: string;
        alertName: string;
        currentPrice: number;
        alertType: 'upper' | 'lower';
        threshold: number;
        changePercent?: number;
    };

    // Portfolio / Trade types
    type TradeType = 'BUY' | 'SELL' | 'OPTION_PREMIUM' | 'DIVIDEND';
    type CostBasisMethod = 'FIFO' | 'AVERAGE';
    type OptionAction = 'BUY_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_OPEN' | 'SELL_TO_CLOSE';
    type TradeSource = 'manual' | 'csv_robinhood' | 'csv_schwab' | 'csv_wealthsimple' | 'csv_generic' | 'discord';

    type TradeData = {
        _id: string;
        userId: string;
        symbol: string;
        type: TradeType;
        quantity: number;
        pricePerShare: number;
        totalAmount: number;
        fees: number;
        optionDetails?: {
            contractType: 'CALL' | 'PUT';
            action: OptionAction;
            strikePrice: number;
            expirationDate: string;
            contracts: number;
            premiumPerContract: number;
        };
        notes?: string;
        executedAt: string;
        source: TradeSource;
        importBatchId?: string;
        createdAt: string;
        updatedAt: string;
        // Computed per-trade fields (populated by getTradesWithPL)
        realizedPL?: number;
        cashFlow?: number;
        runningCostPerShare?: number;
        runningAdjustedCostPerShare?: number;
    };

    type OpenOptionPosition = {
        contractType: 'CALL' | 'PUT';
        direction: 'long' | 'short';
        strikePrice: number;
        expirationDate: string;
        netContracts: number;
        avgPremium: number;
        totalCost: number;
        currentPrice: number;
        currentValue: number;
        unrealizedPL: number;
    };

    type PositionWithPriceData = {
        symbol: string;
        company: string;
        shares: number;
        costBasis: number;
        avgCostPerShare: number;
        adjustedCostBasis: number;
        adjustedCostPerShare: number;
        realizedPL: number;
        unrealizedPL: number;
        optionsPremiumNet: number;
        dividendsReceived: number;
        currentPrice: number;
        marketValue: number;
        totalReturn: number;
        totalReturnPercent: number;
        costBasisMethod: CostBasisMethod;
        lots: { shares: number; costPerShare: number; date: string }[];
        openOptions: OpenOptionPosition[];
        optionsClosedPL: number;
        dailyChange: number;
        dailyChangePercent: number;
    };

    type PortfolioSummaryData = {
        totalValue: number;
        cashBalance: number;
        portfolioValue: number;
        totalCostBasis: number;
        totalRealizedPL: number;
        totalUnrealizedPL: number;
        totalOptionsPremium: number;
        totalOptionsClosedPL: number;
        totalOpenOptionsValue: number;
        totalDividends: number;
        todayReturn: number;
        todayReturnPercent: number;
        positions: PositionWithPriceData[];
    };

    type PLChartData = {
        date: string;
        totalValue: number;
        totalCostBasis: number;
        realizedPL: number;
        unrealizedPL: number;
        totalPL: number;
    };

    // Position Plan types
    type PositionTier = 'core' | 'satellite' | 'speculative';

    type StagedTarget = {
        price: number;
        label: string;
        sellPct: number;
        trailingStopPct?: number;
        reached: boolean;
        reachedAt?: string;
    };

    type CashTransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE_BUY' | 'TRADE_SELL' | 'OPTION_PREMIUM' | 'DIVIDEND';

    type CashTransaction = {
        type: CashTransactionType;
        amount: number;
        description: string;
        relatedSymbol?: string;
        relatedTradeId?: string;
        date: string;
    };

    type PositionPlanSlot = {
        symbol: string;
        tier: PositionTier;
        topics: string[];
        targetPct: number | null;
        targetAmount: number | null;
        notes: string;
        addedAt: string;
        sector?: string;
        industry?: string;
        stagedTargets: StagedTarget[];
        stopLossPrice?: number;
        trailingStopPct?: number;
        trailingStopActivatedAt?: string;
        maxDrawdownPct: number;
        costBasis?: number;
        avgEntryPrice?: number;
    };

    type TierTargets = {
        core: number;
        satellite: number;
        speculative: number;
    };

    type TierMaxSlots = {
        core: number;
        satellite: number;
        speculative: number;
    };

    type SectorTarget = {
        sector: string;
        targetPct: number;
    };

    type PositionPlanData = {
        userId: string;
        slots: PositionPlanSlot[];
        tierTargets: TierTargets;
        tierMaxSlots: TierMaxSlots;
        sectorTargets: SectorTarget[];
        cashBalance: number;
        cashTransactions: CashTransaction[];
        maxDrawdownPctDefault: number;
        lastAuditResult?: RulesAuditResult;
    };

    type EnrichedPlanSlot = PositionPlanSlot & {
        actualPct: number;
        actualAmount: number;
        deltaPct: number;
        hasPosition: boolean;
        currentPrice?: number;
        maxLossAmount?: number;
        stopLossDistance?: number;
        drawdownFromHigh?: number;
    };

    type RuleViolationSeverity = 'error' | 'warning' | 'info';

    type RuleViolation = {
        ruleId: string;
        ruleName: string;
        severity: RuleViolationSeverity;
        message: string;
        affectedSymbols: string[];
        recommendation: string;
    };

    type RulesAuditResult = {
        violations: RuleViolation[];
        structureValid: boolean;
        totalScore: number;
        timestamp: string;
    };

    type SectorHeatData = {
        sector: string;
        etfSymbol: string;
        performance1D: number;
        performance1W: number;
        performance1M: number;
        momentum: number;
        yourAllocationPct: number;
    };

    // AI Portfolio Review — CRO Risk Mandate structured output
    type PortfolioReviewJSON = {
        structuralAudit: {
            assessment: string;
            signal: 'GREEN' | 'YELLOW' | 'RED';
            totalSlots: number;
            surplusCount: number;
            coreSlots: { symbol: string; weight: number; notionalExposure: string; note: string }[];
            satelliteSlots: { symbol: string; weight: number; note: string }[];
            betaSensitivity: { scenario: string; impact: number; description: string }[];
            singlePointOfFailure: string;
        };
        liquidationList: {
            analysis: string;
            zombiePositions: { symbol: string; weight: number; pnlPct: number; reason: string }[];
            redundancies: { keep: string; kill: string[]; reason: string }[];
            invalidTheses: { symbol: string; lossPct: number; reason: string }[];
        };
        deepDive: {
            coreAnalysis: {
                symbol: string;
                analysis: string;
                deltaExposure: string;
                keyLevels: string;
                thetaRisk: string;
            }[];
            satelliteAnalysis: {
                symbol: string;
                analysis: string;
                profitTranches: string;
                reentryLevel: string;
            }[];
        };
        executionOrders: {
            sellOrders: {
                priority: number;
                symbol: string;
                action: string;
                reason: string;
            }[];
            circuitBreaker: {
                triggerValue: number;
                description: string;
            };
        };
    };
}

export {};