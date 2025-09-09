using System;

namespace MathUtilities
{
    public class SimpleCalculator
    {
        private double lastResult;
        private string lastOperation;
        
        public double LastResult 
        { 
            get { return lastResult; } 
            private set { lastResult = value; }
        }
        
        public string LastOperation 
        { 
            get { return lastOperation; } 
            private set { lastOperation = value; }
        }
        
        public SimpleCalculator()
        {
            Reset();
        }
        
        public double Add(double firstNumber, double secondNumber)
        {
            lastResult = firstNumber + secondNumber;
            lastOperation = $"{firstNumber} + {secondNumber} = {lastResult}";
            return lastResult;
        }
        
        public double Subtract(double firstNumber, double secondNumber)
        {
            lastResult = firstNumber - secondNumber;
            lastOperation = $"{firstNumber} - {secondNumber} = {lastResult}";
            return lastResult;
        }
        
        public double Multiply(double firstNumber, double secondNumber)
        {
            lastResult = firstNumber * secondNumber;
            lastOperation = $"{firstNumber} * {secondNumber} = {lastResult}";
            return lastResult;
        }
        
        public double Divide(double firstNumber, double secondNumber)
        {
            if (secondNumber == 0)
            {
                throw new DivideByZeroException("Cannot divide by zero!");
            }
            
            lastResult = firstNumber / secondNumber;
            lastOperation = $"{firstNumber} / {secondNumber} = {lastResult}";
            return lastResult;
        }
        
        public double Power(double baseNumber, double exponent)
        {
            lastResult = Math.Pow(baseNumber, exponent);
            lastOperation = $"{baseNumber} ^ {exponent} = {lastResult}";
            return lastResult;
        }
        
        public double SquareRoot(double number)
        {
            if (number < 0)
            {
                throw new ArgumentException("Cannot calculate square root of negative number!");
            }
            
            lastResult = Math.Sqrt(number);
            lastOperation = $"√{number} = {lastResult}";
            return lastResult;
        }
        
        public void Reset()
        {
            lastResult = 0;
            lastOperation = "Calculator Reset";
        }
        
        public void PrintHistory()
        {
            Console.WriteLine($"Last Operation: {lastOperation}");
            Console.WriteLine($"Current Result: {lastResult}");
        }
    }
}