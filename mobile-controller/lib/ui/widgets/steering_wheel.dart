import 'dart:math' as math;
import 'package:flutter/material.dart';

class SteeringWheel extends StatefulWidget {
  final double currentAngle; // -1.0 to 1.0
  final ValueChanged<double> onAngleChanged;
  final double size;
  final int degreesOfRotation; // e.g. 180, 270, 540, 900, 1080
  final bool isBusDesign;

  const SteeringWheel({
    super.key,
    required this.currentAngle,
    required this.onAngleChanged,
    this.size = 210,
    this.degreesOfRotation = 900,
    this.isBusDesign = true,
  });

  @override
  State<SteeringWheel> createState() => _SteeringWheelState();
}

class _SteeringWheelState extends State<SteeringWheel> with SingleTickerProviderStateMixin {
  double _currentTurnRad = 0.0;
  late AnimationController _springController;
  late Animation<double> _springAnimation;

  double get _maxRad => (widget.degreesOfRotation / 2.0) * (math.pi / 180.0);

  @override
  void initState() {
    super.initState();
    _springController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 260),
    );
    _springController.addListener(() {
      setState(() {
        _currentTurnRad = _springAnimation.value;
      });
      final normalized = (_currentTurnRad / _maxRad).clamp(-1.0, 1.0);
      widget.onAngleChanged(normalized);
    });
  }

  @override
  void dispose() {
    _springController.dispose();
    super.dispose();
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (_springController.isAnimating) _springController.stop();

    final dx = details.delta.dx;
    final deltaRad = (dx / (widget.size / 2)) * 1.8;

    setState(() {
      _currentTurnRad = (_currentTurnRad + deltaRad).clamp(-_maxRad, _maxRad);
    });

    final normalized = (_currentTurnRad / _maxRad).clamp(-1.0, 1.0);
    widget.onAngleChanged(normalized);
  }

  void _onPanEnd(DragEndDetails details) {
    _springAnimation = Tween<double>(begin: _currentTurnRad, end: 0.0).animate(
      CurvedAnimation(parent: _springController, curve: Curves.easeOutCubic),
    );
    _springController.forward(from: 0.0);
  }

  @override
  Widget build(BuildContext context) {
    final displayRad = _springController.isAnimating 
        ? _currentTurnRad 
        : (widget.currentAngle * _maxRad);

    final turnPercent = (_maxRad > 0 ? (displayRad / _maxRad) : 0.0).clamp(-1.0, 1.0);
    final currentDeg = (turnPercent * (widget.degreesOfRotation / 2.0)).toInt();

    return Column(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        GestureDetector(
          onPanUpdate: _onPanUpdate,
          onPanEnd: _onPanEnd,
          child: Container(
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF00F0FF).withValues(alpha: 0.20),
                  blurRadius: 24,
                  spreadRadius: 2,
                )
              ],
            ),
            child: Transform.rotate(
              angle: displayRad,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Outer Heavy-Duty Rim
                  Container(
                    width: widget.size,
                    height: widget.size,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: const Color(0xFF00F0FF),
                        width: widget.isBusDesign ? 9 : 7,
                      ),
                      gradient: const RadialGradient(
                        colors: [Color(0xFF1E293B), Color(0xFF020617)],
                        stops: [0.55, 1.0],
                      ),
                    ),
                  ),

                  // Grip Knurls on Rim
                  Positioned(
                    top: 2,
                    child: Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        color: const Color(0xFF00F0FF),
                        borderRadius: BorderRadius.circular(4),
                        boxShadow: const [
                          BoxShadow(color: Color(0xFF00F0FF), blurRadius: 8)
                        ],
                      ),
                    ),
                  ),

                  // Heavy Duty 4-Spoke / 2-Spoke Commercial Bus & Truck Hub Architecture
                  // Horizontal Main Bar
                  Container(
                    width: widget.size * 0.74,
                    height: widget.size * 0.08,
                    decoration: BoxDecoration(
                      color: const Color(0xFF334155),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: const Color(0xFF475569), width: 1),
                    ),
                  ),

                  // Lower Dual Angled V-Spokes (Realistic Coach / Truck Wheel)
                  Positioned(
                    bottom: widget.size * 0.16,
                    left: widget.size * 0.28,
                    child: Transform.rotate(
                      angle: 0.45,
                      child: Container(
                        width: widget.size * 0.06,
                        height: widget.size * 0.36,
                        color: const Color(0xFF334155),
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: widget.size * 0.16,
                    right: widget.size * 0.28,
                    child: Transform.rotate(
                      angle: -0.45,
                      child: Container(
                        width: widget.size * 0.06,
                        height: widget.size * 0.36,
                        color: const Color(0xFF334155),
                      ),
                    ),
                  ),

                  // Center Bus/Truck Horn Hub with Beveled Ring
                  Container(
                    width: widget.size * 0.38,
                    height: widget.size * 0.38,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF0F172A),
                      border: Border.all(color: const Color(0xFF00F0FF), width: 2.5),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF00F0FF).withValues(alpha: 0.35),
                          blurRadius: 12,
                        )
                      ],
                    ),
                    child: Center(
                      child: Icon(
                        widget.isBusDesign ? Icons.directions_bus_rounded : Icons.local_shipping_rounded,
                        color: const Color(0xFF00F0FF),
                        size: widget.size * 0.18,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        const SizedBox(height: 6),

        // Angle Gauge Badge
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: const Color(0xFF0F172A),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: const Color(0xFF00F0FF).withValues(alpha: 0.3)),
          ),
          child: Text(
            '${currentDeg > 0 ? "+$currentDeg" : currentDeg}°  [${widget.degreesOfRotation}°]',
            style: const TextStyle(
              color: Color(0xFF00F0FF),
              fontWeight: FontWeight.w900,
              fontSize: 10.5,
              fontFamily: 'monospace',
            ),
          ),
        ),
      ],
    );
  }
}
