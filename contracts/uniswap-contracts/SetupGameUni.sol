// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "../interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../interfaces/IUniswapFactory.sol";
import "../interfaces/IERC20.sol";

contract SetupGameUni is Ownable {
    enum Status {
        Created,
        Closed,
        Finished
    }

    struct BetInfo {
        address token0;
        address token1;
        address initiator;
        uint48 startTime;
        uint48 endTime;
        bool isStopLoss;
        uint256 totalBetsSL;
        uint256 totalBetsTP;
        uint256 takeProfitPrice;
        uint256 stopLossPrice;
        uint256 startingAssetPrice;
        uint256 finalAssetPrice;
        Status gameStatus;
    }

    uint256 bettersSL;
    uint256 bettersTP;
    mapping(uint256 => address) public teamSL;
    mapping(uint256 => address) public teamTP;
    mapping(address => uint256) public betAmounts;

    BetInfo public game;
    address public treasury;

    constructor(
        bool isStopLoss,
        uint48 startTime,
        uint48 endTime,
        uint256 takeProfitPrice,
        uint256 stopLossPrice,
        address initiator,
        uint256 amount,
        address uniFactory,
        address token0,
        address token1
    ) Ownable(msg.sender) {
        game.isStopLoss = isStopLoss;
        game.initiator = initiator;
        game.startTime = startTime;
        game.endTime = endTime;
        game.stopLossPrice = stopLossPrice;
        game.takeProfitPrice = takeProfitPrice;
        game.gameStatus = Status.Created;
        game.token0 = token0;
        game.token1 = token1;
        game.startingAssetPrice = getTokenPrice(token0, token1, uniFactory);
        if (amount != 0) {
            betAmounts[msg.sender] = amount;
            if (isStopLoss) {
                teamSL[bettersSL++] = msg.sender;
                game.totalBetsSL = amount;
            } else {
                teamTP[bettersTP++] = msg.sender;
                game.totalBetsTP = amount;
            }
        }
    }

    function bet(bool isStopLoss, uint256 amount) public {
        //reentrancy
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >
                block.timestamp,
            "Too late!"
        );
        require(betAmounts[msg.sender] == 0, "bet already exists");
        ITreasury(treasury).deposit(amount, msg.sender);
        betAmounts[msg.sender] = amount;
        if (isStopLoss) {
            teamSL[bettersSL++] = msg.sender;
            game.totalBetsSL += amount;
        } else {
            teamTP[bettersTP++] = msg.sender;
            game.totalBetsTP += amount;
        }
    }

    function closeBet() public {
        require(game.initiator == msg.sender, "Wrong sender");
        require(
            (game.startTime + (game.endTime - game.startTime) / 3 <
                block.timestamp &&
                (bettersSL == 0 || bettersTP == 0)),
            "Wrong status!"
        );
        for (uint i; i < bettersSL; i++) {
            ITreasury(treasury).refund(betAmounts[teamSL[i]], teamSL[i]);
        }
        for (uint i; i < bettersTP; i++) {
            ITreasury(treasury).refund(betAmounts[teamTP[i]], teamTP[i]);
        }

        game.gameStatus = Status.Closed;
    }

    //only owner
    function endGame(address uniFactory) public onlyOwner {
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        uint256 finalPrice = getTokenPrice(game.token0, game.token1, uniFactory);
        if (game.isStopLoss) {
            if (finalPrice <= game.stopLossPrice) {
                //sl team wins
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalBetsTP,
                    game.totalBetsSL,
                    game.initiator
                );

                for (uint i; i < bettersSL; i++) {
                    //Не читать с стораджа
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamSL[i],
                        betAmounts[teamSL[i]]
                    );
                }
            } else {
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalBetsSL,
                    game.totalBetsTP,
                    game.initiator
                );
                for (uint i; i < bettersTP; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamTP[i],
                        betAmounts[teamTP[i]]
                    );
                }
            }
        } else {
            if (finalPrice >= game.takeProfitPrice) {
                //tp team wins
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalBetsSL,
                    game.totalBetsTP,
                    game.initiator
                );
                for (uint i; i < bettersTP; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamTP[i],
                        betAmounts[teamTP[i]]
                    );
                }
            } else {
                //sl team wins
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalBetsTP,
                    game.totalBetsSL,
                    game.initiator
                );
                for (uint i; i < bettersSL; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamSL[i],
                        betAmounts[teamSL[i]]
                    );
                }
            }
        }
        game.finalAssetPrice = finalPrice;
        game.gameStatus = Status.Finished;
    }

    function getTokenPrice(
        address token0,
        address token1,
        address uniFactory
    ) public view returns (uint256 finalPrice) {
        IUniswapV2Pair pair = IUniswapV2Pair(
            IUniswapFactory(uniFactory).getPair(token0, token1)
        );
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        if (token0 == pair.token1()) {
            uint256 amount = reserve0 *
                (10 ** IERC20(pair.token1()).decimals());
            finalPrice = amount / reserve1;
            return finalPrice; // return amount of token0 needed to buy token1
        } else if (token0 == pair.token0()) {
            uint256 amount = reserve1 *
                (10 ** IERC20(pair.token0()).decimals());
            finalPrice = amount / reserve1;
            return finalPrice; // return amount of token1 needed to buy token0
        }
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}