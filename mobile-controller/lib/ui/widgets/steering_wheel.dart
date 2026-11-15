import 'dart:math' as math;
import 'package:flutter/material.dart';

class SteeringWheel extends StatefulWidget {
  final double currentAngle; // -1.0 to 1.0
  final ValueChanged<double> onAngleChanged;
  final double size;
  final int degreesOfRotation; // e.g. 180, 270, 540, 900, 1080
  final bool isBusDesign;
  final bool autoCenter;

  const SteeringWheel({
    super.key,
    required this.currentAngle,
    required this.onAngleChanged,
    this.size = 210,
    this.degreesOfRotation = 900,
    this.isBusDesign = true,
    this.autoCenter = true,
  });

  @override
  State<SteeringWheel> createState() => _SteeringWheelState();
}

class _SteeringWheelState extends State<SteeringWheel> with SingleTickerProviderStateMixin {
  double _currentTurnRad = 0.0;
  Offset? _lastPanPos;
  bool _isInteracting = false;
  late AnimationController _springController;
  late Animation<double> _springAnimation;

  double get _maxRad => (widget.degreesOfRotation / 2.0) * (math.pi / 180.0);

  @override
  void initState() {
    super.initState();
    _currentTurnRad = (widget.currentAngle * _maxRad).clamp(-_maxRad, _maxRad);
    _springController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 260),
    );
    _springController.addListener(() {
      setState(() {
        _currentTurnRad = _springAnimation.value;
      });
      final normalized = _maxRad > 0 ? (_currentTurnRad / _maxRad).clamp(-1.0, 1.0) : 0.0;
      widget.onAngleChanged(normalized);
    });
  }

  @override
  void didUpdateWidget(covariant SteeringWheel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_isInteracting && !_springController.isAnimating) {
      _currentTurnRad = (widget.currentAngle * _maxRad).clamp(-_maxRad, _maxRad);
    }
  }

  @override
  void dispose() {
    _springController.dispose();
    super.dispose();
  }

  void _onPanStart(DragStartDetails details) {
    if (_springController.isAnimating) {
      _springController.stop();
    }
    _isInteracting = true;
    _currentTurnRad = (widget.currentAngle * _maxRad).clamp(-_maxRad, _maxRad);
    _lastPanPos = details.localPosition;
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (_springController.isAnimating) {
      _springController.stop();
    }
    _isInteracting = true;

    final currentPos = details.localPosition;
    if (_lastPanPos == null) {
      _lastPanPos = currentPos;
      return;
    }

    final center = Offset(widget.size / 2.0, widget.size / 2.0);
    final v1 = _lastPanPos! - center;
    final v2 = currentPos - center;
    _lastPanPos = currentPos;

    // Minimum radius threshold (10px) to prevent sensitivity or jitter near center hub
    if (v1.distance >= 10.0 && v2.distance >= 10.0) {
      // Direct 2D cross and dot products compute exact signed angular delta
      final cross = v1.dx * v2.dy - v1.dy * v2.dx;
      final dot = v1.dx * v2.dx + v1.dy * v2.dy;
      final deltaAngle = math.atan2(cross, dot);

      // Guard against anomalous single-frame touch teleports through center
      if (deltaAngle.abs() < (math.pi * 0.75)) {
        setState(() {
          _currentTurnRad = (_currentTurnRad + deltaAngle).clamp(-_maxRad, _maxRad);
        });

        final normalized = _maxRad > 0 ? (_currentTurnRad / _maxRad).clamp(-1.0, 1.0) : 0.0;
        widget.onAngleChanged(normalized);
      }
    }
  }

  void _onPanEnd(DragEndDetails details) {
    _isInteracting = false;
    _lastPanPos = null;
    if (widget.autoCenter) {
      _springAnimation = Tween<double>(begin: _currentTurnRad, end: 0.0).animate(
        CurvedAnimation(parent: _springController, curve: Curves.easeOutCubic),
      );
      _springController.forward(from: 0.0);
    }
  }

  void _onPanCancel() {
    _isInteracting = false;
    _lastPanPos = null;
    if (widget.autoCenter) {
      _springAnimation = Tween<double>(begin: _currentTurnRad, end: 0.0).animate(
        CurvedAnimation(parent: _springController, curve: Curves.easeOutCubic),
      );
      _springController.forward(from: 0.0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final displayRad = (_isInteracting || _springController.isAnimating)
        ? _currentTurnRad 
        : (widget.currentAngle * _maxRad);

    final turnPercent = (_maxRad > 0 ? (displayRad / _maxRad) : 0.0).clamp(-1.0, 1.0);
    final currentDeg = (turnPercent * (widget.degreesOfRotation / 2.0)).toInt();

    return Column(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onPanStart: _onPanStart,
          onPanUpdate: _onPanUpdate,
          onPanEnd: _onPanEnd,
          onPanCancel: _onPanCancel,
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
